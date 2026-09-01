import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Safely initialize Gemini SDK
const apiKey = process.env.GEMINI_API_KEY;
let ai = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is missing!");
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Master Menu Data
const masterMenu = {
  restaurantName: "Pasu's Bistro",
  subtitle: "Authentic Delights & Fusion Cuisine",
  categories: [
    {
      categoryName: "Starters",
      items: [
        { id: "s1", name: "Crispy Paneer Bites", desc: "Golden fried cottage cheese cubes served with spicy mint chutney", price: "₹220" },
        { id: "s2", name: "Garlic Butter Mushrooms", desc: "Sautéed button mushrooms tossed in rich garlic butter and herbs", price: "₹240" }
      ]
    },
    {
      categoryName: "Main Course",
      items: [
        { id: "m1", name: "Butter Chicken", desc: "Tender chicken cooked in a rich tomato, butter, and cashew sauce", price: "₹380" },
        { id: "m2", name: "Dal Makhani", desc: "Slow-cooked black lentils simmered overnight with cream and butter", price: "₹280" }
      ]
    },
    {
      categoryName: "Beverages & Desserts",
      items: [
        { id: "d1", name: "Mango Lassi", desc: "Thick yogurt smoothie blended with fresh Alphonso mango pulp", price: "₹120" },
        { id: "d2", name: "Gulab Jamun", desc: "Warm milk dumplings soaked in cardamom-infused sugar syrup", price: "₹100" }
      ]
    }
  ]
};

let currentActiveMenu = { ...masterMenu, detectedLanguage: "English", isRTL: false };
let sseClients = [];

// Explicit root route pointing to public/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SSE endpoint for live updates to browser clients
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.push(res);
  res.write(`data: ${JSON.stringify(currentActiveMenu)}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// In-memory translation cache
const translationCache = {};

// Hardware translation POST endpoint
app.post('/api/translate', (req, res) => {
  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing 'input' parameter in request body." });
  }

  // Immediately respond HTTP 200 so the ESP32 connection never times out
  res.status(200).json({ 
    success: true, 
    message: "Translation queued successfully." 
  });

  // Background Processing
  (async () => {
    const cacheKey = input.trim().toLowerCase();

    if (translationCache[cacheKey]) {
      console.log(`[Cache Hit] Serving cached result for: "${input}"`);
      currentActiveMenu = translationCache[cacheKey];
      sseClients.forEach(client => client.write(`data: ${JSON.stringify(currentActiveMenu)}\n\n`));
      return;
    }

    if (!ai) {
      console.error("Gemini API call skipped: GEMINI_API_KEY environment variable is not set.");
      return;
    }

    console.log(`[Gemini API Call] Translating menu for input: "${input}"`);

    const promptText = `
Analyze this input text: "${input}". 
Identify the target language from this input (it can be a language name, a phrase spoken in that language, or a request).
Translate the full menu into that detected language.

Return raw JSON matching the required schema. Set 'isRTL' to true for right-to-left languages (e.g. Arabic, Hebrew, Urdu). Keep all price strings unchanged.

Data:
${JSON.stringify(masterMenu)}
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              detectedLanguage: { type: 'STRING' },
              restaurantName: { type: 'STRING' },
              subtitle: { type: 'STRING' },
              isRTL: { type: 'BOOLEAN' },
              categories: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    categoryName: { type: 'STRING' },
                    items: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          id: { type: 'STRING' },
                          name: { type: 'STRING' },
                          desc: { type: 'STRING' },
                          price: { type: 'STRING' }
                        },
                        required: ['id', 'name', 'desc', 'price']
                      }
                    }
                  },
                  required: ['categoryName', 'items']
                }
              }
            },
            required: ['detectedLanguage', 'restaurantName', 'subtitle', 'isRTL', 'categories']
          }
        }
      });

      const rawText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      const translatedMenu = JSON.parse(rawText);

      translationCache[cacheKey] = translatedMenu;
      currentActiveMenu = translatedMenu;

      // Broadcast update to all connected web interfaces
      sseClients.forEach(client => client.write(`data: ${JSON.stringify(currentActiveMenu)}\n\n`));
      console.log(`[Success] Menu updated to ${translatedMenu.detectedLanguage}`);

    } catch (err) {
      console.error("Gemini API Error:", err.message);
    }
  })();
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});