import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini API SDK safely
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

// Master Menu Data with Multicultural Cuisines & High-Quality Images
const masterMenu = {
  restaurantName: "PolyGlot menu",
  subtitle: "A World of Flavors — English, Indian, Chinese & Japanese Specialties",
  categories: [
    {
      categoryName: "English Classics",
      items: [
        { 
          id: "e1", 
          name: "Fish and Chips", 
          desc: "Beer-battered cod served with thick-cut golden fries, tartar sauce, and mushy peas", 
          price: "£14.50",
          image: "https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?auto=format&fit=crop&w=300&q=80"
        },
        { 
          id: "e2", 
          name: "Full English Breakfast", 
          desc: "Cumberland sausage, crispy bacon, fried eggs, grilled tomatoes, mushrooms, and baked beans", 
          price: "£12.00",
          image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=300&q=80"
        }
      ]
    },
    {
      categoryName: "Indian Delights",
      items: [
        { 
          id: "i1", 
          name: "Butter Chicken", 
          desc: "Tender chicken cooked in a creamy tomato gravy infused with butter and aromatic spices", 
          price: "₹380",
          image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=300&q=80"
        },
        { 
          id: "i2", 
          name: "Paneer Tikka", 
          desc: "Marinated cottage cheese cubes grilled in a traditional clay oven with capsicum and onions", 
          price: "₹280",
          image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=300&q=80"
        }
      ]
    },
    {
      categoryName: "Chinese Specialties",
      items: [
        { 
          id: "c1", 
          name: "Kung Pao Chicken", 
          desc: "Stir-fried diced chicken with roasted peanuts, chili peppers, and Sichuan peppercorns", 
          price: "¥58",
          image: "https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=300&q=80"
        },
        { 
          id: "c2", 
          name: "Dim Sum Basket", 
          desc: "Assorted steamed dumplings filled with minced shrimp, pork, and fresh vegetables", 
          price: "¥45",
          image: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=300&q=80"
        }
      ]
    },
    {
      categoryName: "Japanese Delicacies",
      items: [
        { 
          id: "j1", 
          name: "Tonkotsu Ramen", 
          desc: "Rich pork bone broth served with fresh noodles, tender chashu pork, and a soft-boiled egg", 
          price: "¥1,200",
          image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=300&q=80"
        },
        { 
          id: "j2", 
          name: "Assorted Nigiri Sushi", 
          desc: "Hand-pressed seasoned rice topped with fresh salmon, tuna, and yellowtail slices", 
          price: "¥1,800",
          image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=300&q=80"
        }
      ]
    }
  ]
};

let currentActiveMenu = { ...masterMenu, detectedLanguage: "English", isRTL: false };
let sseClients = [];

// Serve frontend from public/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SSE endpoint for live updates to browser UI
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

// Translation memory cache
const translationCache = {};

// Hardware POST API endpoint
app.post('/api/translate', (req, res) => {
  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing 'input' parameter in request body." });
  }

  // Acknowledge hardware request immediately to prevent connection timeouts
  res.status(200).json({ 
    success: true, 
    message: "Translation queued successfully." 
  });

  // Background translation processing
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
Translate the full menu into that detected language. Preserve exact dish image URLs and price strings without modification.

Return raw JSON matching the required schema. Set 'isRTL' to true for right-to-left languages (e.g. Arabic, Hebrew, Urdu).

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
                          price: { type: 'STRING' },
                          image: { type: 'STRING' }
                        },
                        required: ['id', 'name', 'desc', 'price', 'image']
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

      // Broadcast new menu state to connected SSE browser clients
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