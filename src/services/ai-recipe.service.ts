
import { Injectable, inject } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Recipe, RecipePreparation, RecipeIngredient, Category } from '../models/db.models';
import { supabase } from './supabase-client';
import { environment } from '../config/environment';

@Injectable({
  providedIn: 'root',
})
export class AiRecipeService {
  private dataService: SupabaseService;
  private authService: AuthService;
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.dataService = inject(SupabaseService);
    this.authService = inject(AuthService);
    
    if (environment.geminiApiKey && !environment.geminiApiKey.includes('YOUR_GEMINI_API_KEY')) {
      this.ai = new GoogleGenAI({ apiKey: environment.geminiApiKey });
    } else {
      console.warn('Gemini API Key is not configured in src/config/environment.ts. AI recipe features will be disabled.');
    }
  }
  
  async generateFullRecipe(dishName: string): Promise<{ recipe: Recipe; preparations: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[] }> {
    if (!this.ai) {
      throw new Error('Serviço de IA não configurado. Por favor, adicione sua Gemini API Key no arquivo src/config/environment.ts');
    }

    // Step 1: Ensure at least one station exists, create a default one if not.
    let stations = this.dataService.stations();
    if (stations.length === 0) {
        const { success, error } = await this.dataService.addStation('Cozinha');
        if (!success) {
            throw new Error(`Failed to create a default production station. Cannot proceed. Error: ${error?.message}`);
        }
        // Instead of refetching, we can be optimistic and add it to the signal, or just use a mock object for this flow.
        // For simplicity and robustness, we will refetch from SupabaseService's raw client.
        const { data: refetchedStations } = await supabase.from('stations').select('*').eq('user_id', this.authService.currentUser()!.id);
        stations = refetchedStations || [];
        if (stations.length === 0) throw new Error('Could not verify station creation.');
    }
    
    // Step 2: Gather current data for the prompt
    const ingredientsList = this.dataService.ingredients().map(i => `- ${i.name} (unidade: ${i.unit})`).join('\n');
    const stationsList = stations.map(s => s.name).join(', ');
    const categoriesList = this.dataService.categories().map(c => c.name).join(', ');

    // Step 3: Construct enhanced prompt and schema
    const prompt = `Você é um chef de cozinha especialista em criar fichas técnicas para restaurantes. Crie uma ficha técnica completa para o prato "${dishName}".
    
    Analise o prato e determine a melhor categoria para ele. As categorias existentes são: ${categoriesList}. Se nenhuma for adequada, crie um nome de categoria novo e conciso.
    
    Considere os seguintes ingredientes já disponíveis no estoque:
    ${ingredientsList}
    
    Se um ingrediente comum para o prato não estiver na lista, você pode adicioná-lo. As preparações devem ser alocadas para uma das seguintes estações: ${stationsList}.
    
    Estime um custo operacional para o prato (e.g., gás, eletricidade).
    
    Retorne um objeto JSON com a seguinte estrutura:
    - category_name: O nome da categoria (existente ou nova).
    - description: Uma breve e atrativa descrição do prato para o cardápio.
    - prep_time_in_minutes: O tempo total de preparo em minutos (apenas o número).
    - operational_cost: O custo operacional estimado em BRL (apenas o número).
    - preparations: Um array de objetos, onde cada objeto representa uma etapa da preparação e contém:
      - name: O nome da preparação (ex: "Molho de Tomate", "Preparo do Filé").
      - station_name: O nome da estação de produção (deve ser UMA das seguintes: ${stationsList}).
      - ingredients: Um array de objetos de ingrediente, cada um com:
        - name: O nome do ingrediente.
        - quantity: A quantidade necessária (número).
        - unit: A unidade de medida ('g', 'kg', 'ml', 'l', 'un').`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            category_name: { type: Type.STRING },
            description: { type: Type.STRING },
            prep_time_in_minutes: { type: Type.INTEGER },
            operational_cost: { type: Type.NUMBER },
            preparations: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        station_name: { type: Type.STRING },
                        ingredients: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    unit: { type: Type.STRING, enum: ['g', 'kg', 'ml', 'l', 'un'] }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    
    // Step 4: Call Gemini API
    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema }
    });
    
    const aiResponse = JSON.parse(response.text);

    // Step 5: Process the response and interact with DB
    // 5a. Handle Category
    const allCategories = this.dataService.categories();
    let category = allCategories.find(c => c.name.toLowerCase() === aiResponse.category_name.toLowerCase());
    if (!category) {
        const { data: newCategory, error } = await this.dataService.addRecipeCategory(aiResponse.category_name);
        if (error || !newCategory) throw new Error(`Failed to create new category: ${error?.message}`);
        category = newCategory;
    }
    
    // 5b. Create the Recipe
    const recipeData: Partial<Recipe> = {
        name: dishName,
        category_id: category.id,
        description: aiResponse.description,
        prep_time_in_minutes: aiResponse.prep_time_in_minutes,
        operational_cost: aiResponse.operational_cost,
    };
    const { data: newRecipe, error: recipeError } = await this.dataService.addRecipe(recipeData);
    if (recipeError || !newRecipe) throw new Error(recipeError?.message || 'Falha ao criar o prato no banco de dados.');

    // 5c. Handle Preparations and Ingredients
    const preparationsForState = await this.processAiPreparations(aiResponse.preparations, newRecipe.id);
    
    // Step 6: Return the fully formed recipe data for the modal
    return { recipe: newRecipe, preparations: preparationsForState };
  }

  async generateTechSheetForRecipe(recipe: Recipe): Promise<{ preparations: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[], operational_cost: number, prep_time_in_minutes: number }> {
    if (!this.ai) {
      throw new Error('Serviço de IA não configurado. Por favor, adicione sua Gemini API Key no arquivo src/config/environment.ts');
    }
    
    const stations = this.dataService.stations();
    if (stations.length === 0) {
        throw new Error('No production stations found. Please create one in Settings first.');
    }
    
    const ingredientsList = this.dataService.ingredients().map(i => `- ${i.name} (unidade: ${i.unit})`).join('\n');
    const stationsList = stations.map(s => s.name).join(', ');

    const prompt = `Você é um chef de cozinha especialista em criar fichas técnicas para restaurantes. Crie uma ficha técnica completa para o prato "${recipe.name}".
    
    Considere os seguintes ingredientes já disponíveis no estoque:
    ${ingredientsList}
    
    Se um ingrediente comum para o prato não estiver na lista, você pode adicioná-lo. As preparações devem ser alocadas para uma das seguintes estações: ${stationsList}.
    
    Estime um custo operacional para o prato (e.g., gás, eletricidade).
    
    Retorne um objeto JSON com a seguinte estrutura:
    - prep_time_in_minutes: O tempo total de preparo em minutos (apenas o número).
    - operational_cost: O custo operacional estimado em BRL (apenas o número).
    - preparations: Um array de objetos, onde cada objeto representa uma etapa da preparação e contém:
      - name: O nome da preparação (ex: "Molho de Tomate", "Preparo do Filé").
      - station_name: O nome da estação de produção (deve ser UMA das seguintes: ${stationsList}).
      - ingredients: Um array de objetos de ingrediente, cada um com:
        - name: O nome do ingrediente.
        - quantity: A quantidade necessária (número).
        - unit: A unidade de medida ('g', 'kg', 'ml', 'l', 'un').`;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            prep_time_in_minutes: { type: Type.INTEGER },
            operational_cost: { type: Type.NUMBER },
            preparations: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        station_name: { type: Type.STRING },
                        ingredients: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    unit: { type: Type.STRING, enum: ['g', 'kg', 'ml', 'l', 'un'] }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    
    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema }
    });
    
    const aiResponse = JSON.parse(response.text);

    const preparationsForState = await this.processAiPreparations(aiResponse.preparations, recipe.id);

    return { 
        preparations: preparationsForState, 
        operational_cost: aiResponse.operational_cost,
        prep_time_in_minutes: aiResponse.prep_time_in_minutes
    };
  }

  private async processAiPreparations(
    aiPreparations: any[], 
    recipeId: string
  ): Promise<(RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]> {
    
    const preparationsForState: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[] = [];
    const ingredientsMap = new Map(this.dataService.ingredients().map(i => [i.name.toLowerCase(), i]));
    const stations = this.dataService.stations();
    const stationsMap = new Map(stations.map(s => [s.name.toLowerCase(), s]));
    const userId = this.authService.currentUser()!.id;

    for (const [prepIndex, prep] of aiPreparations.entries()) {
        const station = stationsMap.get(prep.station_name.toLowerCase());
        const recipe_ingredients: RecipeIngredient[] = [];
        const prepTempId = `temp-${prepIndex}`;

        for (const ing of prep.ingredients) {
            let ingredient = ingredientsMap.get(ing.name.toLowerCase());
            if (!ingredient) {
                const { data, error } = await this.dataService.addIngredient({ name: ing.name, unit: ing.unit, cost: 0, stock: 0, min_stock: 0, category_id: null, supplier_id: null });
                if (error || !data) {
                    console.error(`Falha ao criar novo ingrediente "${ing.name}":`, error);
                    continue; // Skip this ingredient if it fails to be created
                }
                ingredient = data;
                ingredientsMap.set(ing.name.toLowerCase(), ingredient); // Add to map to avoid re-creating
            }
            
            recipe_ingredients.push({
                recipe_id: recipeId,
                ingredient_id: ingredient.id,
                quantity: ing.quantity,
                preparation_id: prepTempId,
                user_id: userId,
                ingredients: { name: ingredient.name, unit: ing.unit, cost: ingredient.cost }
            });
        }

        preparationsForState.push({
            id: prepTempId,
            recipe_id: recipeId,
            name: prep.name,
            station_id: station?.id || stations[0]?.id,
            display_order: prepIndex,
            created_at: new Date().toISOString(),
            user_id: userId,
            recipe_ingredients: recipe_ingredients,
        });
    }
    
    return preparationsForState;
  }
}