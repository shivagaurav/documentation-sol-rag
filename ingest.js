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

// NEW: Curated Next.js "Golden" Documentation (High Signal, Low Noise)
const nextJsDocsUrls = [
  "https://nextjs.org/docs",
  "https://nextjs.org/docs/app/getting-started",
  "https://nextjs.org/docs/app/getting-started/installation",
  "https://nextjs.org/docs/app/getting-started/project-structure",
  "https://nextjs.org/docs/app/getting-started/react-essentials",
  "https://nextjs.org/docs/app/getting-started/images-and-images",
  "https://nextjs.org/docs/app/getting-started/css-and-styling",
  "https://nextjs.org/docs/app/building-your-application/routing",
  "https://nextjs.org/docs/app/building-your-application/routing/defining-routes",
  "https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts",
  "https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating",
  "https://nextjs.org/docs/app/building-your-application/routing/error-handling",
  "https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming",
  "https://nextjs.org/docs/app/building-your-application/routing/redirecting",
  "https://nextjs.org/docs/app/building-your-application/routing/route-groups",
  "https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes",
  "https://nextjs.org/docs/app/building-your-application/routing/parallel-routes",
  "https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes",
  "https://nextjs.org/docs/app/building-your-application/routing/route-handlers",
  "https://nextjs.org/docs/app/building-your-application/routing/middleware",
  "https://nextjs.org/docs/app/building-your-application/routing/internationalization",
  "https://nextjs.org/docs/app/building-your-application/rendering",
  "https://nextjs.org/docs/app/building-your-application/rendering/server-components",
  "https://nextjs.org/docs/app/building-your-application/rendering/client-components",
  "https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns",
  "https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering",
  "https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes",
  "https://nextjs.org/docs/app/building-your-application/data-fetching",
  "https://nextjs.org/docs/app/building-your-application/data-fetching/fetching-caching-and-revalidating",
  "https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations",
  "https://nextjs.org/docs/app/building-your-application/data-fetching/patterns-and-best-practices",
  "https://nextjs.org/docs/app/building-your-application/caching",
  "https://nextjs.org/docs/app/building-your-application/styling",
  "https://nextjs.org/docs/app/building-your-application/styling/css-modules",
  "https://nextjs.org/docs/app/building-your-application/styling/tailwind-css",
  "https://nextjs.org/docs/app/building-your-application/styling/css-in-js",
  "https://nextjs.org/docs/app/building-your-application/optimizing",
  "https://nextjs.org/docs/app/building-your-application/optimizing/images",
  "https://nextjs.org/docs/app/building-your-application/optimizing/videos",
  "https://nextjs.org/docs/app/building-your-application/optimizing/fonts",
  "https://nextjs.org/docs/app/building-your-application/optimizing/scripts",
  "https://nextjs.org/docs/app/building-your-application/optimizing/metadata",
  "https://nextjs.org/docs/app/building-your-application/optimizing/static-assets",
  "https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading",
  "https://nextjs.org/docs/app/building-your-application/optimizing/analytics",
  "https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation",
  "https://nextjs.org/docs/app/building-your-application/optimizing/open-telemetry",
  "https://nextjs.org/docs/app/building-your-application/optimizing/package-bundling",
  "https://nextjs.org/docs/app/building-your-application/optimizing/memory-usage",
  "https://nextjs.org/docs/app/building-your-application/configuring/typescript",
  "https://nextjs.org/docs/app/building-your-application/configuring/eslint",
  "https://nextjs.org/docs/app/building-your-application/configuring/environment-variables",
  "https://nextjs.org/docs/app/building-your-application/configuring/absolute-imports-and-module-aliases",
  "https://nextjs.org/docs/app/building-your-application/configuring/mdx",
  "https://nextjs.org/docs/app/building-your-application/configuring/src-directory",
  "https://nextjs.org/docs/app/building-your-application/configuring/draft-mode",
  "https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy",
  "https://nextjs.org/docs/app/building-your-application/testing",
  "https://nextjs.org/docs/app/building-your-application/testing/vitest",
  "https://nextjs.org/docs/app/building-your-application/testing/jest",
  "https://nextjs.org/docs/app/building-your-application/testing/playwright",
  "https://nextjs.org/docs/app/building-your-application/testing/cypress",
  "https://nextjs.org/docs/app/building-your-application/deploying",
  "https://nextjs.org/docs/app/building-your-application/deploying/production-checklist",
  "https://nextjs.org/docs/app/building-your-application/deploying/static-exports",
  "https://nextjs.org/docs/app/building-your-application/upgrading/app-router-migration",
  "https://nextjs.org/docs/app/api-reference/file-conventions/layout",
  "https://nextjs.org/docs/app/api-reference/file-conventions/page",
  "https://nextjs.org/docs/app/api-reference/file-conventions/loading",
  "https://nextjs.org/docs/app/api-reference/file-conventions/not-found",
  "https://nextjs.org/docs/app/api-reference/file-conventions/error",
  "https://nextjs.org/docs/app/api-reference/file-conventions/global-error",
  "https://nextjs.org/docs/app/api-reference/file-conventions/route",
  "https://nextjs.org/docs/app/api-reference/file-conventions/template",
  "https://nextjs.org/docs/app/api-reference/file-conventions/default",
  "https://nextjs.org/docs/app/api-reference/file-conventions/middleware",
  "https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config",
  "https://nextjs.org/docs/app/api-reference/file-conventions/metadata",
  "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap",
  "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots",
  "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest",
  "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image",
  "https://nextjs.org/docs/app/api-reference/components/image",
  "https://nextjs.org/docs/app/api-reference/components/link",
  "https://nextjs.org/docs/app/api-reference/components/script",
  "https://nextjs.org/docs/app/api-reference/components/font",
  "https://nextjs.org/docs/app/api-reference/functions/cookies",
  "https://nextjs.org/docs/app/api-reference/functions/headers",
  "https://nextjs.org/docs/app/api-reference/functions/fetch",
  "https://nextjs.org/docs/app/api-reference/functions/image-response",
  "https://nextjs.org/docs/app/api-reference/functions/next-response",
  "https://nextjs.org/docs/app/api-reference/functions/not-found",
  "https://nextjs.org/docs/app/api-reference/functions/redirect",
  "https://nextjs.org/docs/app/api-reference/functions/revalidatePath",
  "https://nextjs.org/docs/app/api-reference/functions/revalidateTag",
  "https://nextjs.org/docs/app/api-reference/functions/use-params",
  "https://nextjs.org/docs/app/api-reference/functions/use-pathname",
  "https://nextjs.org/docs/app/api-reference/functions/use-router",
  "https://nextjs.org/docs/app/api-reference/functions/use-search-params",
  "https://nextjs.org/docs/app/api-reference/next-config-js"
]

// NEW: Placeholder for Phase 3!
const sitecoreDocsUrls = [
    // We will populate this with Sitecore 10.4 XM / JSS links next
];

// Deleted the getNextJsUrls() sitemap function completely from here

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
    await processFramework(nextJsDocsUrls, "nextjs"); // Using our curated array!
    
    // Ready for the final phase!
    // console.log("Processing Sitecore Docs...");
    // await processFramework(sitecoreDocsUrls, "sitecore"); 

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