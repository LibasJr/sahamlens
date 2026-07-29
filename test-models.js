const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

async function checkModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Using API Key:", apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

checkModels();
