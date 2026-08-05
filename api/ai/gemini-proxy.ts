import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

// Aumenta o tempo de execução máximo para chamadas LLM que podem demorar
export const maxDuration = 60;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', ['POST']);
    return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Gemini Proxy] GEMINI_API_KEY not configured.');
    return response.status(500).json({ error: 'Server configuration error.' });
  }

  const { prompt, type } = request.body;
  
  if (!prompt) {
    return response.status(400).json({ error: 'Missing prompt' });
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
        
        return response.status(200).json({ result: JSON.parse(jsonText) });
    } else {
        const result = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
        });
        
        return response.status(200).json({ text: result.text });
    }
  } catch (error: any) {
    console.error('[Gemini Proxy] Error calling Gemini API:', error);
    return response.status(500).json({ error: error.message || 'Failed to communicate with AI service' });
  }
}
