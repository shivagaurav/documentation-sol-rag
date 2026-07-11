require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function askOracle(userQuestion) {
    console.log(`\n🔮 You asked: "${userQuestion}"\n`);
    
    // 1. Connect to Pinecone
    console.log("☁️ Connecting to Pinecone...");
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    // 2. Initialize native Google AI Client
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const embedModel = genAI.getGenerativeModel(
        { model: "gemini-embedding-001" }, 
        { apiVersion: "v1" }
    );

    // 3. RETRIEVAL: Embed the question and slice to 768 dimensions (MRL)
    console.log("🔍 Searching enterprise knowledge base...");
    const embedResult = await embedModel.embedContent(userQuestion);
    
    // Slice the query down to 768 to match the Pinecone index exactly
    const queryVector = embedResult.embedding.values.slice(0, 768);

    const searchResults = await pineconeIndex.query({
        vector: queryVector,
        topK: 3,
        includeMetadata: true
    });
    
    // Combine the 3 best chunks into our context string
    const retrievedContext = searchResults.matches.map(match => match.metadata.pageContent).join("\n\n---\n\n");
    console.log("✅ Retrieved Context. Generating architectural answer...\n");

    // 4. AUGMENTED GENERATION: Strictly grounded AI response
    const chatModel = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0 } 
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

    const response = await chatModel.generateContent(strictPrompt);
    
    console.log("==========================================");
    console.log("🤖 ORACLE RESPONSE:");
    console.log("==========================================\n");
    console.log(response.response.text());
    console.log("\n==========================================");
}

// Fire the question!
// askOracle("How do I use React Server Components, and what is the 'use client' for?");

askOracle("please suggest! it's better to include useMemo, useCallback and alsway memoize whereever possible to improve performance correct?");