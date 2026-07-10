require("dotenv").config();
const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { Pinecone } = require("@pinecone-database/pinecone");
const { PineconeStore } = require("@langchain/pinecone");

async function askOracle(userQuestion) {
    console.log(`\n🔮 You asked: "${userQuestion}"\n`);
    
    // 1. Connect to our existing cloud infrastructure
    console.log("☁️ Connecting to Pinecone...");
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "text-embedding-004", 
    });

    // Link LangChain to our existing populated Pinecone index
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
    });

    // 2. RETRIEVAL: Search the cloud for semantic matches
    console.log("🔍 Searching enterprise knowledge base...");
    const searchResults = await vectorStore.similaritySearch(userQuestion, 3);
    
    // Combine the 3 best chunks into our context string
    const retrievedContext = searchResults.map(result => result.pageContent).join("\n\n---\n\n");
    console.log("✅ Retrieved Context. Generating architectural answer...\n");

    // 3. AUGMENTED GENERATION: Strictly grounded AI response
    const llm = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-1.5-flash", 
        temperature: 0 // Strict, factual answers only
    });

    const strictPrompt = `
        You are a highly experienced Staff Frontend Engineer.
        Answer the user's question using ONLY the provided documentation context below.
        If the answer is not contained in the context, do not guess. Simply reply: "I don't have enough documentation to answer that."

        CONTEXT:
        ${retrievedContext}

        USER QUESTION:
        ${userQuestion}
    `;

    const response = await llm.invoke(strictPrompt);
    
    console.log("==========================================");
    console.log("🤖 ORACLE RESPONSE:");
    console.log("==========================================\n");
    console.log(response.content);
    console.log("\n==========================================");
}

// Fire the question!
askOracle("How do I use React Server Components, and what is the 'use client' directive for?");