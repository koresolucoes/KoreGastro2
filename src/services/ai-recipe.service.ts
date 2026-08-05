
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AiRecipeService {
  private http = inject(HttpClient);

  async callGeminiForPrediction(prompt: string): Promise<{ ingredientId: string; predictedUsage: number; }[]> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ result: { ingredientId: string; predictedUsage: number; }[] }>('/api/ai/gemini-proxy', {
          prompt,
          type: 'prediction'
        })
      );
      
      if (!response || !response.result) {
        throw new Error('Invalid response from AI proxy');
      }
      return response.result;
    } catch (error) {
      console.error('Error calling Gemini API proxy for prediction:', error);
      throw new Error('Failed to get prediction from AI service.');
    }
  }
  
  private async callGeminiForText(prompt: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>('/api/ai/gemini-proxy', {
          prompt,
          type: 'text'
        })
      );
      
      if (!response || !response.text) {
        throw new Error('Invalid response from AI proxy');
      }
      return response.text;
    } catch (error) {
      console.error('Error calling Gemini API proxy for text:', error);
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