require("dotenv").config();
const cheerio = require("cheerio");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const reactDocsUrls = [
    // 1. Daily Driver Hooks
    "https://react.dev/reference/react/useState",
    "https://react.dev/reference/react/useEffect",
    "https://react.dev/reference/react/useContext",
    
    // 2. Performance & Memoization
    "https://react.dev/reference/react/useMemo",
    "https://react.dev/reference/react/useCallback",
    
    // 3. Concurrency & Priority
    "https://react.dev/reference/react/useTransition",
    "https://react.dev/reference/react/useDeferredValue",
    "https://react.dev/reference/react/startTransition",
    "https://react.dev/blog/2022/03/29/react-v18#what-is-concurrent-react",
    
    // 4. Other Core Concepts
    "https://react.dev/reference/react/useRef",
    "https://react.dev/reference/react/useReducer",
    "https://react.dev/reference/react/useLayoutEffect",
    "https://react.dev/learn/reusing-logic-with-custom-hooks",
    
    // 5. Server-Side Rendering (SSR) & RSC
    "https://react.dev/reference/rsc/server-components",
    "https://react.dev/reference/rsc/use-client",
    "https://react.dev/reference/rsc/use-server",
    "https://react.dev/reference/react/Suspense",
    "https://react.dev/reference/react-dom/client/hydrateRoot",
    "https://react.dev/reference/react-dom/server/renderToPipeableStream",
    
    // 6. Advanced Architecture & Error Handling
    "https://legacy.reactjs.org/docs/higher-order-components.html",
    "https://react.dev/reference/react/forwardRef",
    "https://react.dev/reference/react-dom/createPortal",
    "https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary",
    
    // 7. Optimization Tools
    "https://react.dev/reference/react/memo",
    "https://react.dev/reference/react/StrictMode",
    "https://react.dev/reference/react/Profiler",
    
    // 8. Niche / Library-Author Hooks
    "https://react.dev/reference/react/useSyncExternalStore",
    "https://react.dev/reference/react/useId",
    "https://react.dev/reference/react/useInsertionEffect",
    
    // 9. Server Actions & Forms
    "https://react.dev/reference/react-dom/components/form",
    "https://react.dev/reference/react/useActionState",
    "https://react.dev/reference/react-dom/hooks/useFormStatus",
    "https://react.dev/reference/react/useOptimistic",
    
    // 10. RSC Data Fetching & Caching
    "https://react.dev/reference/react/use",
    "https://react.dev/reference/react/cache",
    "https://react.dev/reference/react/experimental_taintObjectReference",
    "https://react.dev/reference/rsc/server-actions"
];

// Removed the unused visionModel parameter
async function scrapeSinglePage(url) {
    console.log(`Fetching: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        // --- PILLAR 2: MULTIMODAL DIAGRAM EXTRACTION ---
        const imageUrls = [];
        $('img').each((i, el) => {
            const src = $(el).attr('src');
            // STRICT FILTER: Ignore SVGs and data URIs to save Vision API quota!
            if (src && !src.startsWith('data:') && !src.toLowerCase().endsWith('.svg')) {
                // Convert relative paths to absolute URLs
                const absoluteUrl = new URL(src, url).href;
                imageUrls.push(absoluteUrl);
            }
        });

        // Limit to 2 images per page to protect your free tier rate limits
        const targetImages = imageUrls.slice(0, 2);
        let imageDescriptions = "";

        for (const imgUrl of targetImages) {
            console.log(`   👁️  Analyzing diagram using Local Vision AI: ${imgUrl}`);
            try {
                const imgResp = await fetch(imgUrl);
                if (!imgResp.ok) continue;
                
                const arrayBuffer = await imgResp.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');

                const prompt = "You are an expert software architect. Analyze this image. If it is an architecture diagram, describe the nodes, data flows, and technical details. If it is a UI mockup, describe the components. Be highly technical.";
                
                // ENTERPRISE PATTERN: Hybrid Architecture! 
                // We route the heavy image processing to our LOCAL machine via Ollama.
                // NO RATE LIMITS. NO EXPONENTIAL BACKOFF NEEDED.
                const result = await fetch("http://localhost:11434/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "minicpm-v", // Swapped to a highly efficient, OCR-focused Small Language Model
                        messages: [
                            {
                                role: "user",
                                content: prompt,
                                images: [base64] // Ollama accepts raw base64 arrays
                            }
                        ],
                        stream: false
                    })
                });
                
                if (!result.ok) throw new Error("Local Ollama server not responding. Is it running?");
                
                const data = await result.json();
                const description = data.message.content;
                
                imageDescriptions += `\n\n--- ARCHITECTURE DIAGRAM / IMAGE ---\nSource URL: ${imgUrl}\nTechnical Description: ${description}\n----------------------------------\n\n`;
                
            } catch (err) {
                console.warn(`   ⚠️ Failed to analyze image ${imgUrl}: ${err.message}`);
            }
        }
        // -----------------------------------------------

        $('script, style, nav, footer, header, aside, .toc').remove();
        const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
        
        // Return both the raw text AND the highly detailed image descriptions
        return cleanText + imageDescriptions;
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
        const $ = cheerio.load(xml, { xmlMode: true });
        const nextUrls = [];

        $('loc').each((i, el) => {
            const url = $(el).text();
            // STRICT FILTER: Only grab actual documentation pages
            if (url.startsWith("https://nextjs.org/docs")) {
                nextUrls.push(url);
            }
        });
        console.log(`✅ Found ${nextUrls.length} Next.js documentation pages.`);
        
        // Removed the testing limit! We are going for the full enterprise load now.
        return nextUrls; 
    } catch (error) {
        console.error("❌ Failed to fetch Next.js sitemap:", error.message);
        return [];
    }
}

async function buildKnowledgeBase() {
    console.log(`\n🚀 Initiating Cloud Ingestion Pipeline...\n`);
    
    // Initialize Native Google AI Client for Embeddings only
    console.log("🧠 Initializing Native Google AI Client (Embeddings)...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Embedding Model for Vector Search
    const embedModel = genAI.getGenerativeModel(
        { model: "gemini-embedding-001" },
        { apiVersion: "v1" } 
    );
    
    const nextJsUrls = await getNextJsUrls();
    
    console.log("\n🔪 Scraping and Chunking documentation with Metadata and Multimodal support...");
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    let allSplitChunks = [];

    // Process a specific framework's URLs and tag them with metadata
    async function processFramework(urls, frameworkName) {
        for (const url of urls) {
            // No longer passing visionModel here
            const pageText = await scrapeSinglePage(url);
            if (pageText) {
                const chunks = await textSplitter.createDocuments(
                    [pageText], 
                    [{ framework: frameworkName, sourceUrl: url }] 
                );
                allSplitChunks.push(...chunks);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log("Processing React Docs...");
    await processFramework(reactDocsUrls, "react");

    console.log("Processing Next.js Docs...");
    await processFramework(nextJsUrls, "nextjs");

    console.log(`✅ Success! Generated ${allSplitChunks.length} fully tagged semantic chunks.\n`);

    console.log("☁️ Connecting to Pinecone Cloud...");
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    console.log("📤 Translating to math and validating before Pinecone upload...");
    const validChunks = allSplitChunks.filter(c => c.pageContent.trim().length > 0);
    
    const batchSize = 10; 
    
    for (let i = 0; i < validChunks.length; i += batchSize) {
        const batch = validChunks.slice(i, i + batchSize);
        console.log(`⏳ Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(validChunks.length / batchSize)} (${batch.length} chunks)...`);
        
        try {
            const requests = batch.map(chunk => ({
                content: { role: 'user', parts: [{ text: chunk.pageContent }] }
            }));
            
            const response = await embedModel.batchEmbedContents({ requests });
            const vectors = response.embeddings.map(e => e.values);

            const pineconeRecords = [];
            for (let j = 0; j < vectors.length; j++) {
                if (!vectors[j]) {
                    console.warn(`   ⚠️ Chunk ${i + j} returned undefined. Skipping.`);
                    continue; 
                }

                const vector768 = vectors[j].slice(0, 768);

                pineconeRecords.push({
                    id: `chunk-${i + j}-${Date.now()}`, 
                    values: vector768,         
                    metadata: {                 
                        pageContent: batch[j].pageContent,
                        framework: batch[j].metadata.framework, 
                        sourceUrl: batch[j].metadata.sourceUrl  
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