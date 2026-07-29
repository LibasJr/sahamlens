import { GoogleGenerativeAI } from "@google/generative-ai"

const apiKey = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

export const model = genAI ? genAI.getGenerativeModel({ 
  model: "gemini-3.6-flash",
}) : null;

export const jsonModel = genAI ? genAI.getGenerativeModel({ 
  model: "gemini-3.6-flash",
  generationConfig: { responseMimeType: "application/json" }
}) : null;
