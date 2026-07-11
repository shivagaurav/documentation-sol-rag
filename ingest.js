require("dotenv").config();
const cheerio = require("cheerio");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { Pinecone } = require("@pinecone-database/pinecone");
const { PineconeStore } = require("@langchain/pinecone");
const { TaskType, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// The highly curated list of foundational React concepts for our Oracle PoC
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
    // "https://react.dev/reference/react/startTransition",
    // "https://react.dev/blog/2022/03/29/react-v18#what-is-concurrent-react",
    
    // 4. Other Core Concepts
    // "https://react.dev/reference/react/useRef",
    // "https://react.dev/reference/react/useReducer",
    // "https://react.dev/reference/react/useLayoutEffect",
    // "https://react.dev/learn/reusing-logic-with-custom-hooks",
    
    // // 5. Server-Side Rendering (SSR) & RSC
    // "https://react.dev/reference/rsc/server-components",
    // "https://react.dev/reference/rsc/use-client",
    // "https://react.dev/reference/rsc/use-server",
    // "https://react.dev/reference/react/Suspense",
    // "https://react.dev/reference/react-dom/client/hydrateRoot",
    // "https://react.dev/reference/react-dom/server/renderToPipeableStream",
    
    // // 6. Advanced Architecture & Error Handling
    // "https://legacy.reactjs.org/docs/higher-order-components.html",
    // "https://react.dev/reference/react/forwardRef",
    // "https://react.dev/reference/react-dom/createPortal",
    // "https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary",
    
    // // 7. Optimization Tools
    // "https://react.dev/reference/react/memo",
    // "https://react.dev/reference/react/StrictMode",
    // "https://react.dev/reference/react/Profiler",
    
    // // 8. Niche / Library-Author Hooks
    // "https://react.dev/reference/react/useSyncExternalStore",
    // "https://react.dev/reference/react/useId",
    // "https://react.dev/reference/react/useInsertionEffect",
    
    // // 9. Server Actions & Forms
    // "https://react.dev/reference/react-dom/components/form",
    // "https://react.dev/reference/react/useActionState",
    // "https://react.dev/reference/react-dom/hooks/useFormStatus",
    // "https://react.dev/reference/react/useOptimistic",
    
    // // 10. RSC Data Fetching & Caching
    // "https://react.dev/reference/react/use",
    // "https://react.dev/reference/react/cache",
    // "https://react.dev/reference/react/experimental_taintObjectReference",
    // "https://react.dev/reference/rsc/server-actions"
];

// Helper function to fetch and clean a single page
async function scrapeSinglePage(url) {
    console.log(`Fetching: ${url}`);
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Strip out the non-documentation junk (navs, footers, scripts, sidebars)
        $('script, style, nav, footer, header, aside, .toc').remove();
        
        // Extract the clean text and normalize whitespace
        return $('body').text().replace(/\s+/g, ' ').trim();
    } catch (error) {
        console.error(`❌ Failed to scrape ${url}:`, error.message);
        return ""; // Return empty string so the pipeline doesn't crash
    }
}

async function buildKnowledgeBase() {
    console.log(`\n🚀 Initiating ingestion pipeline for ${reactDocsUrls.length} pages...\n`);
    
    let massiveCombinedText = "";
    let successfulScrapes = 0;

    // Loop through all URLs synchronously to respect rate limits
    for (const url of reactDocsUrls) {
        const pageText = await scrapeSinglePage(url);
        
        if (pageText) {
            // Add hard boundaries between pages to prevent context bleeding
            massiveCombinedText += pageText + "\n\n\n---END_OF_DOCUMENT---\n\n\n"; 
            successfulScrapes++;
        }
        
        // Pause for 1 second between requests to prevent IP blocking
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n✅ Finished crawling. Successfully scraped ${successfulScrapes}/${reactDocsUrls.length} pages.`);
    console.log(`📊 Total extracted text volume: ${massiveCombinedText.length} characters.`);
    console.log("\n🔪 Sending massive text volume to the intelligent chunker...");

    // Initialize the LangChain recursive splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,      // Max characters per chunk
        chunkOverlap: 200,    // 200 characters overlap to preserve context across chunks
    });

    // Create the LangChain document chunks
    const splitChunks = await textSplitter.createDocuments([massiveCombinedText]);

    console.log(`✅ Success! The React documentation was split into ${splitChunks.length} semantic chunks.\n`);
    
    // Peek at the data to verify it worked
    if (splitChunks.length > 0) {
        console.log("--- PEEK: CHUNK 10 ---");
        console.log(splitChunks[10].pageContent.substring(0, 300) + "...\n");
    }

    // 3. Initialize Pinecone Client
    console.log("☁️ Connecting to Pinecone Cloud...");
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    // 4. Initialize Google Embeddings (Dense Vector Math)
    // const embeddings = new GoogleGenerativeAIEmbeddings({
    //     apiKey: process.env.GEMINI_API_KEY,
    //     modelName: "text-embedding-004", 
    //     taskType: TaskType.RETRIEVAL_DOCUMENT, 
    // });

    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "text-embedding-004", 
        taskType: TaskType.RETRIEVAL_DOCUMENT, 
        maxConcurrency: 1,  // Forces LangChain to process embeddings sequentially
        maxRetries: 3,      // Tells LangChain to retry instead of silently failing
        // NEW: Disable safety filters for technical documentation
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
    });

    // 5. Cloud Upsert (The magic happens here)
    // 5. Cloud Upsert (With custom Batching to respect Gemini API Rate Limits)
    console.log("📤 Translating to math and uploading to Pinecone in controlled batches...");
    
    // Connect a VectorStore to our index
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
    });

    // NEW: Defensive programming to strip empty chunks
    const validChunks = splitChunks.filter(c => c.pageContent.trim().length > 0);

    // We process the chunks 100 at a time to keep Gemini's servers happy
    const batchSize = 10;
    // const batchSize = 5;
    
    for (let i = 0; i < validChunks.length; i += batchSize) {
        const batch = validChunks.slice(i, i + batchSize);
        console.log(`⏳ Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(validChunks.length / batchSize)} (${batch.length} chunks)...`);
        
        // Upload the current batch
        await vectorStore.addDocuments(batch);
        
        // If there are more batches left, pause for 3 seconds to let the API rate limit reset
        if (i + batchSize < validChunks.length) {
            console.log("   -> Sleeping for 3 seconds to respect Gemini API limits...");
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.log(`\n✅ Success! ${splitChunks.length} document vectors are now live in your Pinecone database.`);
}

buildKnowledgeBase();