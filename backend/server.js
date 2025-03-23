import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import rateLimit from "express-rate-limit";
import path from "path";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Rate Limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Environment Variables
const PORT = process.env.PORT || 5000;
const __dirname = path.resolve();
const MONGO_URI = process.env.MONGO_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate environment variables
if (!MONGO_URI || !GEMINI_API_KEY) {
    console.error("❌ Missing required environment variables (MONGO_URI, GEMINI_API_KEY)");
    process.exit(1);
}

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// MongoDB Connection
mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    });

// Message Schema (optional, for storing chat history)
const messageSchema = new mongoose.Schema({
    userMessage: { type: String, required: true },
    aiResponse: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", messageSchema);

// Root Route
app.get("/", (req, res) => {
    res.send("🚀 Server is running!");
});

// Chat Route with Gemini API Integration
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    console.log("Chat request:", message);

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        // Call Gemini API with a formatted prompt
        const maxRetries = 3;
        let attempt = 0;
        let aiResponse;

        // Add a system instruction to the prompt to request proper formatting
        const formattedPrompt = `
        You are a helpful AI assistant. Please provide a well-formatted response to the following query. Use line breaks, bullet points, or numbered lists where appropriate to make the response easy to read. Avoid returning the response as a single paragraph unless it is a short answer. Here is the user's query:

        ${message}
        `;

        while (attempt < maxRetries) {
            try {
                const result = await model.generateContent(formattedPrompt);
                const response = await result.response;
                aiResponse = response.text().trim();
                break;
            } catch (error) {
                attempt++;
                console.error(`Gemini API Error (Attempt ${attempt}/${maxRetries}):`, error);
                if (error.message.includes("quota")) {
                    return res.status(429).json({ error: "AI service unavailable: Quota exceeded. Please try again later." });
                }
                if (error.message.includes("SAFETY")) {
                    return res.status(400).json({ error: "Message blocked due to safety concerns. Please rephrase your message." });
                }
                if (attempt === maxRetries) {
                    return res.status(500).json({ error: "Failed to get AI response after multiple attempts. Please try again later." });
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Optionally save the message and response to MongoDB
        const newMessage = new Message({
            userMessage: message,
            aiResponse,
        });
        await newMessage.save();

        res.json({ reply: aiResponse });
    } catch (error) {
        console.error("Chat error:", error);
        res.status(500).json({ error: "Server error. Please try again later." });
    }
});

// Optional: Get chat history
app.get("/api/chat/history", async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 }).limit(50);
        res.json(messages.map(msg => ({
            userMessage: msg.userMessage,
            aiResponse: msg.aiResponse,
            timestamp: msg.timestamp,
        })));
    } catch (error) {
        console.error("Chat history error:", error);
        res.status(500).json({ error: "Failed to retrieve chat history." });
    }
});

app.use(express.static(path.join(__dirname,"/frontend/dist")));
app.get("*",(req,res)=>{
    res.sendFile(path.resolve(__dirname,"dist","index.html"));
})

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});