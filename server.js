import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google Gen AI Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Master Menu Data
const masterMenu = {
  restaurantName: "Grand Palace Bistro",
  subtitle: "Authentic Culinary Delights & Fresh Ingredients",
  detectedLanguage: "English (Default)",
  isRTL: false,
  categories: [
    {
      categoryName: "Appetizers",
      items: [
        { id: "1", name: "Artisanal Garlic Bread", desc: "Toasted baguette with roasted garlic butter and herbs", price: "$6.99" },
        { id: "2", name: "Crispy Calamari", desc: "Flash-fried squid served with house-made marinara sauce", price: "$12.50" },
        { id: "3", name: "Stuffed Mushrooms", desc: "Button mushrooms stuffed with herbs, garlic, and cream cheese", price: "$9.99" },
        { id: "4", name: "Bruschetta Classic", desc: "Grilled bread topped with tomatoes, basil, and olive oil", price: "$8.50" },
        { id: "5", name: "Chicken Wings", desc: "Crispy wings tossed in spicy buffalo or honey barbecue sauce", price: "$11.99" },
        { id: "6", name: "Spring Rolls", desc: "Crispy vegetable spring rolls served with sweet chili dip", price: "$7.99" }
      ]
    },
    {
      categoryName: "Main Courses",
      items: [
        { id: "7", name: "Artisanal Cheeseburger", desc: "Grass-fed beef patty with aged cheddar, lettuce, and house sauce", price: "$14.99" },
        { id: "8", name: "Margherita Pizza", desc: "Fresh mozzarella, San Marzano tomatoes, and fresh basil", price: "$13.50" },
        { id: "9", name: "Grilled Salmon", desc: "Atlantic salmon fillet served with lemon butter sauce and veggies", price: "$21.99" },
        { id: "10", name: "Ribeye Steak 12oz", desc: "Prime aged ribeye served with garlic mashed potatoes", price: "$28.99" },
        { id: "11", name: "Pasta Carbonara", desc: "Spaghetti tossed with pancetta, egg yolk, parmesan, and black pepper", price: "$16.50" },
        { id: "12", name: "Chicken Alfredo", desc: "Fettuccine pasta in rich creamy parmesan alfredo sauce", price: "$17.99" },
        { id: "13", name: "Vegetable Lasagna", desc: "Layered pasta with ricotta, mozzarella, and seasonal vegetables", price: "$15.00" },
        { id: "14", name: "BBQ Pork Ribs", desc: "Slow-cooked tender pork ribs glazed in smoky barbecue sauce", price: "$23.50" },
        { id: "15", name: "Lamb Chops", desc: "Pan-seared lamb chops infused with rosemary and garlic", price: "$26.99" },
        { id: "16", name: "Seafood Paella", desc: "Saffron rice cooked with shrimp, mussels, squid, and herbs", price: "$24.99" }
      ]
    },
    {
      categoryName: "Soups & Salads",
      items: [
        { id: "17", name: "Garden Salad", desc: "Mixed organic greens, cherry tomatoes, cucumbers, and balsamic dressing", price: "$9.99" },
        { id: "18", name: "Caesar Salad", desc: "Crisp romaine, croutons, shaved parmesan, and Caesar dressing", price: "$10.50" },
        { id: "19", name: "Greek Salad", desc: "Tomatoes, cucumbers, olives, red onion, and feta cheese", price: "$11.25" },
        { id: "20", name: "Tomato Basil Soup", desc: "Rich roasted tomato soup served with crusty bread", price: "$6.50" },
        { id: "21", name: "Clam Chowder", desc: "Creamy New England clam chowder with potatoes and celery", price: "$8.00" },
        { id: "22", name: "Minestrone Soup", desc: "Classic Italian vegetable and pasta soup in light tomato broth", price: "$7.25" }
      ]
    },
    {
      categoryName: "Desserts",
      items: [
        { id: "23", name: "Tiramisu Classic", desc: "Traditional espresso-soaked ladyfingers with mascarpone cream", price: "$7.99" },
        { id: "24", name: "New York Cheesecake", desc: "Creamy baked cheesecake with strawberry reduction", price: "$8.50" },
        { id: "25", name: "Chocolate Lava Cake", desc: "Warm chocolate cake with molten center and vanilla ice cream", price: "$9.00" },
        { id: "26", name: "Crème Brûlée", desc: "Vanilla bean custard topped with hard caramelized sugar", price: "$8.25" },
        { id: "27", name: "Churros with Chocolate", desc: "Fried dough pastries dusted in cinnamon sugar with chocolate dip", price: "$6.99" }
      ]
    },
    {
      categoryName: "Beverages",
      items: [
        { id: "28", name: "Fresh Lemonade", desc: "Freshly squeezed lemon juice with mint leaves", price: "$3.99" },
        { id: "29", name: "Iced Caramel Latte", desc: "Espresso with cold milk, caramel drizzle, and ice", price: "$4.99" },
        { id: "30", name: "Sparkling Mineral Water", desc: "Imported 750ml glass bottle", price: "$4.50" },
        { id: "31", name: "Matcha Green Tea", desc: "Ceremonial grade Japanese matcha steamed with milk", price: "$5.25" },
        { id: "32", name: "Mango Smoothie", desc: "Blended fresh mangoes with yogurt and honey", price: "$5.50" }
      ]
    }
  ]
};

// Track active menu state & SSE connections
let currentActiveMenu = masterMenu;
let sseClients = [];
const translationCache = {};

// SSE Route: Sends data live to web browsers
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

// Hardware Translation Endpoint
app.post('/api/translate', async (req, res) => {
  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing 'input' parameter in request body." });
  }

  const cacheKey = input.trim().toLowerCase();

  // Return cached response to avoid hitting API rate limits
  if (translationCache[cacheKey]) {
    console.log(`[Cache Hit] Serving cached translation for: "${input}"`);
    currentActiveMenu = translationCache[cacheKey];
    
    sseClients.forEach(client => {
      client.write(`data: ${JSON.stringify(currentActiveMenu)}\n\n`);
    });

    return res.status(200).json({ 
      success: true, 
      detectedLanguage: currentActiveMenu.detectedLanguage,
      cached: true 
    });
  }

  console.log(`[API Request] Processing translation via Gemini for: "${input}"`);

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

    // Save to cache
    translationCache[cacheKey] = translatedMenu;

    currentActiveMenu = translatedMenu;
    sseClients.forEach(client => {
      client.write(`data: ${JSON.stringify(currentActiveMenu)}\n\n`);
    });

    return res.status(200).json({ 
      success: true, 
      detectedLanguage: translatedMenu.detectedLanguage 
    });

  } catch (err) {
    console.error("Gemini API Processing Error:", err);
    return res.status(500).json({ error: "Translation request failed." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});