
import { Injectable, inject } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { AuthService } from './auth.service';
import { Recipe, RecipePreparation, RecipeIngredient, Ingredient, RecipeSubRecipe } from '../models/db.models';
import { environment } from '../config/environment';
import { SupabaseStateService } from './supabase-state.service';
import { SettingsDataService } from './settings-data.service';
import { RecipeDataService } from './recipe-data.service';
import { InventoryDataService } from './inventory-data.service';
import { supabase } from './supabase-client';

type TechSheetItem = 
    { type: 'ingredient', data: RecipeIngredient } | 
    { type: 'sub_recipe', data: RecipeSubRecipe };

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
  
  async callGeminiForPrediction(prompt: string): Promise<any> {
    if (!this.ai) throw new Error('Serviço de IA não configurado.');
    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ingredientId: { type: Type.STRING },
          predictedUsage: { type: Type.NUMBER },
        },
      },
    };
    return this.callGemini(prompt, responseSchema);
  }
  
  async generateFullRecipe(dishName: string): Promise<{ recipe: Recipe; items: TechSheetItem[] }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
        throw new Error('Usuário não autenticado para gerar receita.');
    }
    const ingredientsList = this.stateService.ingredients().map(i => `- ${i.name} (unidade: ${i.unit})`).join('\n');
    const categoriesList = this.stateService.categories().map(c => c.name).join(', ');

    const prompt = `Você é um chef. Crie uma ficha técnica completa para "${dishName}". Primeiro, identifique quaisquer "sub-receitas" (mise en place, como molhos, massas, etc.). Depois, liste os ingredientes para a montagem final. Categorias existentes: ${categoriesList}. Ingredientes existentes: ${ingredientsList}. Retorne um JSON com: category_name, description, price, sub_recipes (array de {name, ingredients: [{name, quantity, unit}]}), e final_assembly_ingredients (array de {name, quantity, unit}). A unidade (unit) DEVE ser uma de 'g', 'kg', 'ml', 'l', 'un'.`;
    const responseSchema = { type: Type.OBJECT, properties: { category_name: { type: Type.STRING }, description: { type: Type.STRING }, price: { type: Type.NUMBER }, sub_recipes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, quantity: { type: Type.NUMBER }, unit: { type: Type.STRING, enum: ['g', 'kg', 'ml', 'l', 'un'] } } } } } } }, final_assembly_ingredients: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, quantity: { type: Type.NUMBER }, unit: { type: Type.STRING, enum: ['g', 'kg', 'ml', 'l', 'un'] } } } } } };
    const aiResponse = await this.callGemini(prompt, responseSchema);
    
    let category = this.stateService.categories().find(c => c.name.toLowerCase() === aiResponse.category_name.toLowerCase());
    if (!category) {
        const { data: newCategory } = await this.recipeDataService.addRecipeCategory(aiResponse.category_name);
        if (!newCategory) throw new Error('Falha ao criar nova categoria.');
        category = newCategory;
    }
    
    // 1. Create Sub-Recipes
    const createdSubRecipes = new Map<string, Recipe>();
    for (const subRecipeData of aiResponse.sub_recipes) {
        const { data: newSubRecipe } = await this.recipeDataService.addRecipe({ name: subRecipeData.name, category_id: category.id, is_sub_recipe: true });
        if (!newSubRecipe) continue;
        createdSubRecipes.set(subRecipeData.name, newSubRecipe);
        const ingredients = await this.processAiIngredients(subRecipeData.ingredients);
        await this.recipeDataService.saveTechnicalSheet(newSubRecipe.id, {}, ingredients, []);
    }

    // 2. Create Main Recipe
    const { data: newRecipe } = await this.recipeDataService.addRecipe({ name: dishName, category_id: category.id, description: aiResponse.description, price: aiResponse.price, is_sub_recipe: false });
    if (!newRecipe) throw new Error('Falha ao criar o prato principal.');
    
    // 3. Link ingredients and sub-recipes to the main recipe
    const finalIngredients = await this.processAiIngredients(aiResponse.final_assembly_ingredients);
    // FIX: Add user_id to created sub-recipes to conform to the RecipeSubRecipe type. Assume quantity of 1.
    // FIX: Populate the 'recipes' property to create a more complete object, matching data from Supabase joins and resolving type inference issues.
    const finalSubRecipes = aiResponse.sub_recipes.map((sr: any) => {
        const subRecipe = createdSubRecipes.get(sr.name);
        if (!subRecipe) return null;
        return {
          parent_recipe_id: newRecipe.id,
          child_recipe_id: subRecipe.id,
          quantity: 1,
          user_id: userId,
          recipes: { id: subRecipe.id, name: subRecipe.name },
        };
    }).filter((r: any): r is RecipeSubRecipe => r !== null);

    await this.recipeDataService.saveTechnicalSheet(newRecipe.id, {}, finalIngredients, finalSubRecipes);

    // FIX: Explicitly type the mapped items to help TypeScript inference and prevent type errors.
    const techSheetItems: TechSheetItem[] = [
      ...finalIngredients.map((i): TechSheetItem => ({ type: 'ingredient', data: i })),
      ...finalSubRecipes.map((sr): TechSheetItem => ({ type: 'sub_recipe', data: sr }))
    ];

    return { recipe: newRecipe, items: techSheetItems };
  }

  private async processAiIngredients(aiIngredients: any[]): Promise<RecipeIngredient[]> {
    const ingredientsForState: RecipeIngredient[] = [];
    const ingredientsMap = new Map(this.stateService.ingredients().map(i => [i.name.trim().toLowerCase(), i]));
    const userId = this.authService.currentUser()!.id;

    for (const ing of aiIngredients) {
      if (!ing.name || typeof ing.name !== 'string' || ing.name.trim() === '') continue;
      const normalizedName = ing.name.trim().toLowerCase();
      let ingredient = ingredientsMap.get(normalizedName);

      if (!ingredient) {
        const { data: newIngredient } = await this.inventoryDataService.addIngredient({ name: ing.name.trim(), unit: ing.unit, cost: 0, stock: 0, min_stock: 0 });
        if (!newIngredient) continue;
        ingredient = newIngredient;
        ingredientsMap.set(normalizedName, ingredient);
      }
      
      ingredientsForState.push({
        recipe_id: '', // Will be set by the caller
        ingredient_id: ingredient.id,
        quantity: ing.quantity,
        preparation_id: 'default',
        user_id: userId,
        ingredients: { name: ingredient.name, unit: ingredient.unit, cost: ingredient.cost }
      });
    }
    return ingredientsForState;
  }
}
