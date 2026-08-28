require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// This serves your HTML file so you can view it in the browser
app.use(express.static(path.join(__dirname, "public")));

// Initialize AI and Vector DB once when the server starts
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/api/chat", async (req, res) => {
    const userQuestion = req.body.question;
    const chatHistory = req.body.history || []; // NEW: Grab history from frontend
    console.log(`\n💬 New Question Received: "${userQuestion}"`);

    try {
        const embedModel = genAI.getGenerativeModel(
            { model: "gemini-embedding-001" }, 
            { apiVersion: "v1" }
        );

        const embedResult = await embedModel.embedContent(userQuestion);
        const queryVector = embedResult.embedding.values.slice(0, 768);

        const searchResults = await pineconeIndex.query({
            vector: queryVector,
            topK: 3,
            includeMetadata: true
        });
        
        const retrievedContext = searchResults.matches
            .map(match => match.metadata.pageContent)
            .join("\n\n---\n\n");

        // NEW: Format history for the prompt
        const formattedHistory = chatHistory
            .map(msg => `${msg.role === 'user' ? 'User' : 'Oracle'}: ${msg.content}`)
            .join("\n");

        const chatModel = genAI.getGenerativeModel({ 
            // model: "gemini-2.5-flash",
            model: "gemini-3.5-flash-lite",
            // generationConfig: { temperature: 0 } 
        });

        const strictPrompt = `
            You are a highly experienced Staff Engineer acting as an internal onboarding assistant.
            Answer the user's question using ONLY the provided documentation context below.
            Use the CONVERSATION HISTORY to understand pronouns or follow-up references.
            Format your answer in clean Markdown with code blocks where appropriate.
            If the answer is not contained in the context, do not guess. Reply: "I don't have enough internal documentation to answer that."

            CONVERSATION HISTORY:
            ${formattedHistory ? formattedHistory : "No prior history."}

            CONTEXT:
            ${retrievedContext}

            USER QUESTION:
            ${userQuestion}
        `;

        const response = await chatModel.generateContent(strictPrompt);
        const answer = response.response.text();
        
        res.json({ answer: answer });

    } catch (error) {
        console.error("❌ Oracle Error:", error);
        res.status(500).json({ answer: "An internal server error occurred while consulting the Oracle." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Enterprise RAG Server running at http://localhost:${PORT}`);
    console.log(`📂 Ensure your index.html is inside a folder named 'public'`);
});