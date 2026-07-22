require("dotenv").config();
const cheerio = require("cheerio");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const reactDocsUrls = [
    "https://react.dev/reference/react/useState",
    "https://react.dev/reference/react/useEffect",
    "https://react.dev/reference/react/useContext",
    "https://react.dev/reference/react/useMemo",
    "https://react.dev/reference/react/useCallback",
    "https://react.dev/reference/react/useTransition",
    "https://react.dev/reference/react/useDeferredValue",
    "https://react.dev/reference/react/startTransition",
    "https://react.dev/blog/2022/03/29/react-v18#what-is-concurrent-react",
    "https://react.dev/reference/react/useRef",
    "https://react.dev/reference/react/useReducer",
    "https://react.dev/reference/react/useLayoutEffect",
    "https://react.dev/learn/reusing-logic-with-custom-hooks",
    "https://react.dev/reference/rsc/server-components",
    "https://react.dev/reference/rsc/use-client",
    "https://react.dev/reference/rsc/use-server",
    "https://react.dev/reference/react/Suspense",
    "https://react.dev/reference/react-dom/client/hydrateRoot",
    "https://react.dev/reference/react-dom/server/renderToPipeableStream",
    "https://legacy.reactjs.org/docs/higher-order-components.html",
    "https://react.dev/reference/react/forwardRef",
    "https://react.dev/reference/react-dom/createPortal",
    "https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary",
    "https://react.dev/reference/react/memo",
    "https://react.dev/reference/react/StrictMode",
    "https://react.dev/reference/react/Profiler",
    "https://react.dev/reference/react/useSyncExternalStore",
    "https://react.dev/reference/react/useId",
    "https://react.dev/reference/react/useInsertionEffect",
    "https://react.dev/reference/react-dom/components/form",
    "https://react.dev/reference/react/useActionState",
    "https://react.dev/reference/react-dom/hooks/useFormStatus",
    "https://react.dev/reference/react/useOptimistic",
    "https://react.dev/reference/react/use",
    "https://react.dev/reference/react/cache",
    "https://react.dev/reference/react/experimental_taintObjectReference",
    "https://react.dev/reference/rsc/server-actions"
];

async function scrapeSinglePage(url) {
    console.log(`Fetching: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        $('script, style, nav, footer, header, aside, .toc').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
    } catch (error) {
        console.error(`❌ Failed to scrape ${url}:`, error.message);
        return ""; 
    }
}

// Helper function to dynamically pull Next.js documentation URLs
async function getNextJsUrls() {
    console.log("🗺️ Fetching Next.js sitemap...");
    
    try {
        const response = await fetch("https://nextjs.org/sitemap.xml");
        const xml = await response.text();
        
        // Tell Cheerio to parse this as XML instead of HTML
        const $ = cheerio.load(xml, { xmlMode: true });
        const nextUrls = [];

        // Loop through every <loc> tag in the sitemap
        $('loc').each((i, el) => {
            const url = $(el).text();
            
            // STRICT FILTER: Only grab actual documentation pages
            if (url.startsWith("https://nextjs.org/docs")) {
                nextUrls.push(url);
            }
        });

        console.log(`✅ Found ${nextUrls.length} Next.js documentation pages in the sitemap.`);
        
        // 🛑 SAFETY CAP FOR TESTING: 
        // Next.js has over 1,000 doc pages. Let's slice the array to just the first 20 for our initial test so we don't blow through API limits.
        return nextUrls.slice(0, 20); 
        
    } catch (error) {
        console.error("❌ Failed to fetch Next.js sitemap:", error.message);
        return [];
    }
}

async function buildKnowledgeBase() {

    // TEMPORARY TEST
    const nextLinks = await getNextJsUrls();
    console.log(nextLinks);
    return; // Stops the script here so it doesn't upload anything yet



    console.log(`\n🚀 Initiating Cloud Ingestion Pipeline for ${reactDocsUrls.length} pages...\n`);
    
    let massiveCombinedText = "";
    for (const url of reactDocsUrls) {
        const pageText = await scrapeSinglePage(url);
        if (pageText) massiveCombinedText += pageText + "\n\n\n---END_OF_DOCUMENT---\n\n\n"; 
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("\n🔪 Chunking documentation...");
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const splitChunks = await textSplitter.createDocuments([massiveCombinedText]);
    
    console.log(`✅ Success! Split into ${splitChunks.length} semantic chunks.\n`);

    console.log("☁️ Connecting to Pinecone Cloud...");
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    console.log("🧠 Initializing Native Google AI Client...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const embedModel = genAI.getGenerativeModel(
        { model: "gemini-embedding-001" },
        { apiVersion: "v1" } 
    );

    console.log("📤 Translating to math and validating before Pinecone upload...");
    const validChunks = splitChunks.filter(c => c.pageContent.trim().length > 0);
    
    const batchSize = 10; 
    
    for (let i = 0; i < validChunks.length; i += batchSize) {
        const batch = validChunks.slice(i, i + batchSize);
        console.log(`⏳ Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(validChunks.length / batchSize)} (${batch.length} chunks)...`);
        
        try {
            const vectors = await Promise.all(
                batch.map(async (chunk) => {
                    const result = await embedModel.embedContent(chunk.pageContent);
                    return result.embedding.values;
                })
            );

            const pineconeRecords = [];
            for (let j = 0; j < vectors.length; j++) {
                if (!vectors[j]) {
                    console.warn(`   ⚠️ Chunk ${i + j} returned undefined. Skipping.`);
                    continue; 
                }

                // THE MRL FIX: Slice the 3072-dimension vector down to 768 to perfectly fit Pinecone!
                const vector768 = vectors[j].slice(0, 768);

                pineconeRecords.push({
                    id: `react-chunk-${i + j}`, 
                    values: vector768,         
                    metadata: {                 
                        pageContent: batch[j].pageContent,
                        // ...batch[j].metadata
                    }
                });
            }

            if (pineconeRecords.length > 0) {
                await pineconeIndex.upsert(pineconeRecords);
                console.log(`   ✅ Upserted ${pineconeRecords.length} valid vectors.`);
            }
        } catch (err) {
            console.error(`   ❌ RAW GEMINI API ERROR: ${err.message}`);
        }
        
        if (i + batchSize < validChunks.length) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`\n✅ Success! Document vectors are now safely live in your Pinecone database.`);
}

buildKnowledgeBase();