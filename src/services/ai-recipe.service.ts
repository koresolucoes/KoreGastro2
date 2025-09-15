
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { environment } from '../config/environment';

@Injectable({
  providedIn: 'root',
})
export class AiRecipeService {
  private ai: GoogleGenAI;

  constructor() {
    if (!environment.geminiApiKey) {
      document.body.innerHTML = `<div style="color: white; background-color: #111827; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; padding: 2rem;">
          <h1 style="color: #ef4444; font-size: 1.5rem;">Erro de Configuração</h1>
          <p style="margin-top: 0.5rem;">A chave da API Gemini não foi configurada.</p>
          <p style="margin-top: 1rem; font-size: 0.875rem; color: #9ca3af;">Por favor, edite o arquivo <code>src/config/environment.ts</code> e insira sua chave da API Gemini.</p>
      </div>`;
      throw new Error('Gemini API key not configured.');
    }
    this.ai = new GoogleGenAI({ apiKey: environment.geminiApiKey });
  }

  async callGeminiForPrediction(prompt: string): Promise<{ ingredientId: string; predictedUsage: number; }[]> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
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

      const jsonText = response.text;
      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (error) {
      console.error('Error calling Gemini API for prediction:', error);
      throw new Error('Failed to get prediction from AI service.');
    }
  }
  
  private async callGeminiForText(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error('Error calling Gemini API for text:', error);
      throw new Error('Failed to get text from AI service.');
    }
  }

  async getMiseEnPlaceSuggestions(recipeData: {
    name: string;
    preparations: { name: string; ingredients: { name: string; quantity: number; unit: string }[] }[];
    subRecipes: { name: string; quantity: number }[];
    finalAssemblyIngredients: { name: string; quantity: number; unit: string }[];
  }): Promise<string> {
      const prepStrings = recipeData.preparations.map(p => 
          `- ${p.name}:\n  ${p.ingredients.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}`
      ).join('\n');
      
      const subRecipeStrings = recipeData.subRecipes.map(sr => 
          `- ${sr.name} (x${sr.quantity})`
      ).join('\n');

      const finalAssemblyStrings = recipeData.finalAssemblyIngredients.map(i =>
          `- ${i.name} (${i.quantity} ${i.unit})`
      ).join('\n');

      const prompt = `
          Sou chef de cozinha e estou montando uma ficha técnica para o prato "${recipeData.name}".
          Com base na estrutura abaixo, me dê 3 a 5 dicas curtas e práticas para otimizar a "mise en place", melhorar o fluxo de trabalho durante o serviço e garantir a consistência.
          Foque em agilidade e boas práticas de cozinha. Formate a resposta como uma lista de itens com marcadores.

          Estrutura da Receita:
          **Preparações Prévias:**
          ${prepStrings.length > 0 ? prepStrings : 'Nenhuma'}

          **Sub-Receitas Utilizadas:**
          ${subRecipeStrings.length > 0 ? subRecipeStrings : 'Nenhuma'}

          **Ingredientes para Montagem Final:**
          ${finalAssemblyStrings.length > 0 ? finalAssemblyStrings : 'Nenhum'}
      `;

      return this.callGeminiForText(prompt);
  }
}