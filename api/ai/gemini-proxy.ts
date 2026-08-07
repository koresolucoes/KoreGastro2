import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

// Aumenta o tempo de execução máximo para chamadas LLM que podem demorar
export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Gemini Proxy] GEMINI_API_KEY not configured.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const { prompt, type } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    if (type === 'prediction') {
        const result = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    ingredientId: {
                      type: Type.STRING,
                    },
                    predictedUsage: {
                      type: Type.NUMBER,
                    },
                  },
                  required: ['ingredientId', 'predictedUsage'],
                },
              },
            },
        });
        
        const jsonText = result.text;
        if (!jsonText) throw new Error('No text returned from Gemini API');
        
        return res.status(200).json({ result: JSON.parse(jsonText) });
    } else {
        const result = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
        });
        
        return res.status(200).json({ text: result.text });
    }
  } catch (error: any) {
    console.error('[Gemini Proxy] Error calling Gemini API:', error);
    return res.status(500).json({ error: error.message || 'Failed to communicate with AI service' });
  }
}
