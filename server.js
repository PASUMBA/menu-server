const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is missing!");
}

app.use(cors());
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Expanded Baseline Master Menu Data
const masterMenu = {
  restaurantName: "PolyGlot menu",
  subtitle: "A World of Flavors — English, Indian, Chinese & Japanese Specialties",
  detectedLanguage: "English",
  isRTL: false,
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
        },
        { 
          id: "e3", 
          name: "Shepherd's Pie", 
          desc: "Minced lamb with garden vegetables topped with toasted golden mashed potato crust", 
          price: "£13.50",
          image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=300&q=80"
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
        },
        { 
          id: "i3", 
          name: "Garlic Butter Naan", 
          desc: "Freshly baked leavened flatbread brushed with garlic butter and cilantro", 
          price: "₹80",
          image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=300&q=80"
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
        },
        { 
          id: "c3", 
          name: "Yangzhou Fried Rice", 
          desc: "Wok-fried jasmine rice with prawns, diced BBQ pork, scrambled egg, and green peas", 
          price: "¥48",
          image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=300&q=80"
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
        },
        { 
          id: "j3", 
          name: "Matcha Ice Cream", 
          desc: "Authentic Japanese green tea ice cream served with sweet red bean paste", 
          price: "¥500",
          image: "https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?auto=format&fit=crop&w=300&q=80"
        }
      ]
    }
  ]
};

let currentActiveMenu = JSON.parse(JSON.stringify(masterMenu));
let sseClients = [];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

const translationCache = {};

app.post('/api/translate', (req, res) => {
  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing 'input' parameter in request body." });
  }

  res.status(200).json({ 
    success: true, 
    message: "Translation request queued." 
  });

  (async () => {
    const cacheKey = input.trim().toLowerCase();

    if (translationCache[cacheKey]) {
      console.log(`[Cache Hit] Serving cached result for: "${input}"`);
      currentActiveMenu = translationCache[cacheKey];
      sseClients.forEach(client => client.write(`data: ${JSON.stringify(currentActiveMenu)}\n\n`));
      return;
    }

    if (!genAI) {
      console.error("Gemini API call skipped: GEMINI_API_KEY environment variable is missing.");
      return;
    }

    console.log(`[Gemini API Call] Translating menu for input: "${input}"`);

    const promptText = `
Analyze this input text: "${input}". 
Identify the target language from this input (language name, phrase, or request).
Translate the menu into that detected language. Keep dish image URLs and price strings intact without modification.

Return raw JSON matching the required schema. Set 'isRTL' to true for right-to-left scripts.

Data:
${JSON.stringify(masterMenu)}
`;

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              detectedLanguage: { type: SchemaType.STRING },
              restaurantName: { type: SchemaType.STRING },
              subtitle: { type: SchemaType.STRING },
              isRTL: { type: SchemaType.BOOLEAN },
              categories: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    categoryName: { type: SchemaType.STRING },
                    items: {
                      type: SchemaType.ARRAY,
                      items: {
                        type: SchemaType.OBJECT,
                        properties: {
                          id: { type: SchemaType.STRING },
                          name: { type: SchemaType.STRING },
                          desc: { type: SchemaType.STRING },
                          price: { type: SchemaType.STRING },
                          image: { type: SchemaType.STRING }
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

      const result = await model.generateContent(promptText);
      const translatedMenu = JSON.parse(result.response.text());

      translationCache[cacheKey] = translatedMenu;
      currentActiveMenu = translatedMenu;

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