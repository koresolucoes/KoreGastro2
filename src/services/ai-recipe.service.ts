import { Injectable, inject } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { AuthService } from './auth.service';
import { Recipe, RecipePreparation, RecipeIngredient, Ingredient } from '../models/db.models';
import { environment } from '../config/environment';
import { SupabaseStateService } from './supabase-state.service';
import { SettingsDataService } from './settings-data.service';
import { RecipeDataService } from './recipe-data.service';
import { InventoryDataService } from './inventory-data.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class AiRecipeService {
  private stateService = inject(SupabaseStateService);
  private settingsDataService = inject(SettingsDataService);
  private recipeDataService = inject(RecipeDataService);
  private inventoryDataService = inject(InventoryDataService);
  private authService = inject(AuthService);
  private ai: GoogleGenAI | null = null;

  constructor() {
    if (environment.geminiApiKey && !environment.geminiApiKey.includes('YOUR_GEMINI_API_KEY')) {
      this.ai = new GoogleGenAI({ apiKey: environment.geminiApiKey });
    } else {
      console.warn('Gemini API Key not configured. AI features will be disabled.');
    }
  }

  private async callGemini(prompt: string, responseSchema: any) {
    if (!this.ai) throw new Error('Serviço de IA não configurado. Adicione sua Gemini API Key.');
    try {
      const response = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json', responseSchema } });
      return JSON.parse(response.text);
    } catch (error: any) {
      const errorString = String(error.message || JSON.stringify(error));
      if (errorString.includes('API key not valid') || errorString.includes('API_KEY_INVALID')) {
        throw new Error('A chave da API Gemini é inválida. Verifique `src/config/environment.ts`.');
      }
      throw new Error('Erro na API de IA. Verifique o console.');
    }
  }
  
  async generateFullRecipe(dishName: string): Promise<{ recipe: Recipe; preparations: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[] }> {
    let stations = this.stateService.stations();
    if (stations.length === 0) {
        await this.settingsDataService.addStation('Cozinha');
        const { data } = await supabase.from('stations').select('*').eq('user_id', this.authService.currentUser()!.id);
        stations = data || [];
        if (stations.length === 0) throw new Error('Não foi possível criar a estação de produção padrão.');
    }
    
    const ingredientsList = this.stateService.ingredients().map(i => `- ${i.name} (unidade: ${i.unit})`).join('\n');
    const stationsList = stations.map(s => s.name).join(', ');
    const categoriesList = this.stateService.categories().map(c => c.name).join(', ');

    const prompt = `Você é um chef. Crie uma ficha técnica para "${dishName}". Categorias existentes: ${categoriesList}. Ingredientes existentes: ${ingredientsList}. Estações existentes: ${stationsList}. Retorne um JSON com: category_name, description, prep_time_in_minutes, operational_cost, e um array 'preparations' com name, station_name, e um array 'ingredients' com name, quantity, unit.`;
    const responseSchema = { type: Type.OBJECT, properties: { category_name: { type: Type.STRING }, description: { type: Type.STRING }, prep_time_in_minutes: { type: Type.INTEGER }, operational_cost: { type: Type.NUMBER }, preparations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, station_name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, quantity: { type: Type.NUMBER }, unit: { type: Type.STRING, enum: ['g', 'kg', 'ml', 'l', 'un'] } } } } } } } } };
    const aiResponse = await this.callGemini(prompt, responseSchema);
    
    let category = this.stateService.categories().find(c => c.name.toLowerCase() === aiResponse.category_name.toLowerCase());
    if (!category) {
        const { data: newCategory } = await this.recipeDataService.addRecipeCategory(aiResponse.category_name);
        if (!newCategory) throw new Error('Falha ao criar nova categoria.');
        category = newCategory;
    }
    
    const { data: newRecipe } = await this.recipeDataService.addRecipe({ name: dishName, category_id: category.id, description: aiResponse.description, prep_time_in_minutes: aiResponse.prep_time_in_minutes, operational_cost: aiResponse.operational_cost });
    if (!newRecipe) throw new Error('Falha ao criar o prato.');

    const preparationsForState = await this.processAiPreparations(aiResponse.preparations, newRecipe.id);
    return { recipe: newRecipe, preparations: preparationsForState };
  }

  async generateTechSheetForRecipe(recipe: Recipe): Promise<{ preparations: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[], operational_cost: number, prep_time_in_minutes: number }> {
    const stations = this.stateService.stations();
    if (stations.length === 0) throw new Error('Nenhuma estação de produção encontrada.');
    
    const ingredientsList = this.stateService.ingredients().map(i => `- ${i.name} (unidade: ${i.unit})`).join('\n');
    const stationsList = stations.map(s => s.name).join(', ');

    const prompt = `Você é um chef. Crie uma ficha técnica para "${recipe.name}". Ingredientes existentes: ${ingredientsList}. Estações existentes: ${stationsList}. Retorne um JSON com: prep_time_in_minutes, operational_cost, e um array 'preparations' com name, station_name, e um array 'ingredients' com name, quantity, unit.`;
    const responseSchema = { type: Type.OBJECT, properties: { prep_time_in_minutes: { type: Type.INTEGER }, operational_cost: { type: Type.NUMBER }, preparations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, station_name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, quantity: { type: Type.NUMBER }, unit: { type: Type.STRING, enum: ['g', 'kg', 'ml', 'l', 'un'] } } } } } } } } };
    const aiResponse = await this.callGemini(prompt, responseSchema);
    const preparationsForState = await this.processAiPreparations(aiResponse.preparations, recipe.id);
    return { preparations: preparationsForState, operational_cost: aiResponse.operational_cost, prep_time_in_minutes: aiResponse.prep_time_in_minutes };
  }

  private async processAiPreparations(aiPreparations: any[], recipeId: string): Promise<(RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]> {
    const preparationsForState: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[] = [];
    // Normalize names from DB once: trim and lowercase
    const ingredientsMap = new Map(this.stateService.ingredients().map(i => [i.name.trim().toLowerCase(), i]));
    const stationsMap = new Map(this.stateService.stations().map(s => [s.name.trim().toLowerCase(), s]));
    const userId = this.authService.currentUser()!.id;

    for (const [i, prep] of aiPreparations.entries()) {
        const recipe_ingredients: RecipeIngredient[] = [];
        for (const ing of prep.ingredients) {
            if (!ing.name || typeof ing.name !== 'string' || ing.name.trim() === '') {
                continue; // Safety check for valid ingredient name
            }

            const normalizedName = ing.name.trim().toLowerCase();
            let ingredient: Ingredient | undefined | null = ingredientsMap.get(normalizedName);

            // Simple plural/singular check if no direct match is found
            if (!ingredient) {
                if (normalizedName.endsWith('s')) {
                    const singular = normalizedName.slice(0, -1);
                    if (ingredientsMap.has(singular)) {
                        ingredient = ingredientsMap.get(singular);
                    }
                } else {
                    const plural = normalizedName + 's';
                    if (ingredientsMap.has(plural)) {
                        ingredient = ingredientsMap.get(plural);
                    }
                }
            }
            
            if (!ingredient) {
                // Ingredient doesn't exist, create it.
                // Use the original (but trimmed) name from the AI for creation to preserve casing.
                const newIngredientName = ing.name.trim();
                const { data: newIngredient, error } = await this.inventoryDataService.addIngredient({ name: newIngredientName, unit: ing.unit, cost: 0, stock: 0, min_stock: 0 });
                
                if (error || !newIngredient) {
                    console.error(`Failed to create new ingredient '${newIngredientName}':`, error);
                    continue; // Skip this ingredient if creation fails
                }
                ingredient = newIngredient;
                // Add the new ingredient to our map so it can be found by subsequent lookups in the same run
                ingredientsMap.set(newIngredientName.toLowerCase(), ingredient);
            }
            
            recipe_ingredients.push({
                recipe_id: recipeId,
                ingredient_id: ingredient.id,
                quantity: ing.quantity,
                preparation_id: `temp-${i}`, // Temporary ID for this prep step
                user_id: userId,
                // Include joined data for the UI to display immediately
                ingredients: { name: ingredient.name, unit: ingredient.unit, cost: ingredient.cost }
            });
        }
        
        // Find station, falling back to the first available station if not found
        const station = stationsMap.get(prep.station_name.trim().toLowerCase());
        preparationsForState.push({
            id: `temp-${i}`, // Temporary ID
            recipe_id: recipeId,
            name: prep.name,
            station_id: station?.id || this.stateService.stations()[0]?.id,
            display_order: i,
            created_at: new Date().toISOString(),
            user_id: userId,
            recipe_ingredients // Attach the processed ingredients
        });
    }
    return preparationsForState;
  }
}
