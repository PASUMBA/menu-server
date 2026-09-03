const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS & JSON Request Body Parsing
app.use(cors());
app.use(express.json());

// Serve Static Frontend Files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google Gemini API
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// Master English Menu (Default Baseline State)
const masterMenu = {
  restaurantName: "PASU BISTRO",
  detectedLanguage: "English",
  isRTL: false,
  categories: [
    {
      categoryName: "Starters",
      items: [
        { name: "Crispy Spring Rolls", desc: "Fresh vegetable filling with sweet chili dip", price: "$6.99" },
        { name: "Garlic Bread", desc: "Toasted baguette slices with garlic herb butter", price: "$4.99" },
        { name: "Soup of the Day", desc: "Chef's special daily fresh soup", price: "$5.50" }
      ]
    },
    {
      categoryName: "Main Course",
      items: [
        { name: "Grilled Chicken Burger", desc: "Juicy chicken patty, lettuce, cheddar & fries", price: "$12.99" },
        { name: "Margherita Pizza", desc: "Classic mozzarella, fresh basil, sweet tomato sauce", price: "$14.50" },
        { name: "Creamy Pasta Alfredo", desc: "Penne pasta in rich parmesan cream sauce", price: "$13.99" }
      ]
    },
    {
      categoryName: "Beverages",
      items: [
        { name: "Iced Cold Brew", desc: "Slow-steeped organic coffee beans over ice", price: "$3.99" },
        { name: "Fresh Mango Smoothie", desc: "Blended real mangoes and yogurt", price: "$4.50" },
        { name: "Sparkling Lemonade", desc: "Hand-pressed lemons with sparkling soda", price: "$3.50" }
      ]
    }
  ]
};

// Current State in RAM
let currentMenuState = JSON.parse(JSON.stringify(masterMenu));

// In-Memory Translation Cache (Saves Gemini API tokens)
const translationCache = {
  "English": JSON.parse(JSON.stringify(masterMenu))
};

// Active SSE Client Connections
let sseClients = [];

// ==========================================
// 1. SSE Endpoint (Pushes updates to browser)
// ==========================================
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // CRITICAL: Send initial menu state immediately on connection
  res.write(`data: ${JSON.stringify(currentMenuState)}\n\n`);

  // Track new client
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Broadcast updated state to all connected screen displays
function broadcastMenuUpdate(menuData) {
  currentMenuState = menuData;
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(currentMenuState)}\n\n`);
  });
}

// ==========================================
// 2. Gemini Translation Core Function
// ==========================================
async function translateMenuWithGemini(targetLanguage) {
  // Return cached result if already translated previously
  if (translationCache[targetLanguage]) {
    console.log(`[Cache Hit] Serving '${targetLanguage}' from memory.`);
    return translationCache[targetLanguage];
  }

  console.log(`[API Call] Querying Gemini 3.6-flash for translation to '${targetLanguage}'...`);

  // Target gemini-3.6-flash model
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  const prompt = `
    You are a professional restaurant menu translator. 
    Translate the following English menu JSON into "${targetLanguage}".
    
    Rules:
    1. Translate categoryName, item names, and item descs into natural, culturally accurate ${targetLanguage}.
    2. Keep prices and restaurantName unchanged.
    3. Set "detectedLanguage" to "${targetLanguage}".
    4. Set "isRTL" to true ONLY if ${targetLanguage} uses a Right-To-Left script (e.g., Arabic, Hebrew, Urdu, Farsi). Otherwise false.
    5. Return valid JSON maintaining the exact original structure.

    Master Menu JSON:
    ${JSON.stringify(masterMenu)}
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const translatedMenu = JSON.parse(responseText);

  // Store in cache
  translationCache[targetLanguage] = translatedMenu;
  return translatedMenu;
}

// ==========================================
// 3. Translation Webhook Endpoint
// ==========================================
app.post('/api/translate', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: "Missing 'input' field in request body." });
    }

    console.log(`\nReceived language trigger from ESP32: "${input}"`);

    // Handle fallback if English requested
    if (input.toLowerCase() === 'english' || input.toLowerCase() === 'en') {
      currentMenuState = translationCache["English"];
      broadcastMenuUpdate(currentMenuState);
      return res.json({ success: true, language: "English" });
    }

    // Translate via Gemini / Cache
    const translatedData = await translateMenuWithGemini(input);
    
    // Push update to all displays connected via SSE
    broadcastMenuUpdate(translatedData);

    return res.json({ success: true, language: input, data: translatedData });
  } catch (error) {
    console.error("Error processing translation:", error);
    return res.status(500).json({ error: "Failed to translate menu", details: error.message });
  }
});

// Fallback Route: Serve index.html for all other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Node Server
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`Menu Server running on port ${PORT}`);
  console.log(`SSE Stream Endpoint: http://localhost:${PORT}/api/events`);
  console.log(`Translation Webhook: http://localhost:${PORT}/api/translate`);
  console.log(`==================================================\n`);
});