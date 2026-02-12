
import { Injectable, inject } from '@angular/core';
import { Ingredient, IngredientCategory, RecipeIngredient, RecipePreparation, Supplier, OrderItem, LabelLog, InventoryLog } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { RecipeStateService } from './recipe-state.service';
import { RecipeDataService } from './recipe-data.service';
import { v4 as uuidv4 } from 'uuid';
import { WebhookService } from './webhook.service';
import { InventoryStateService } from './inventory-state.service';
import { PosStateService } from './pos-state.service';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class InventoryDataService {
  private authService = inject(AuthService);
  private recipeState = inject(RecipeStateService);
  private recipeDataService = inject(RecipeDataService);
  private webhookService = inject(WebhookService);
  private inventoryState = inject(InventoryStateService);
  private posState = inject(PosStateService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  // --- Audit: Logs de Estoque ---
  async getInventoryLogs(startDateStr: string, endDateStr: string, ingredientId?: string | null): Promise<{ data: InventoryLog[], error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: [], error: { message: 'Active unit not found' } };

    const startDate = new Date(`${startDateStr}T00:00:00`);
    const endDate = new Date(`${endDateStr}T23:59:59`);

    let query = supabase
      .from('inventory_logs')
      .select('*, employees(name), ingredients(name, unit)')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (ingredientId) {
      query = query.eq('ingredient_id', ingredientId);
    }
    
    // Order by newest first
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    return { data: data || [], error };
  }

  // ... existing methods ...

  async addIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean, error: any, data?: Ingredient }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const initialStock = ingredient.stock || 0;
    const { stock, ...ingredientData } = ingredient;

    const { data: newIngredient, error: ingredientError } = await supabase
      .from('ingredients')
      .insert({ ...ingredientData, stock: 0, user_id: userId })
      .select()
      .single();

    if (ingredientError) return { success: false, error: ingredientError, data: undefined };

    try {
        if (initialStock > 0) {
            const { success, error } = await this.adjustIngredientStock({
                ingredientId: newIngredient.id,
                quantityChange: initialStock,
                reason: 'Entrada de estoque inicial',
                expirationDateForEntry: newIngredient.expiration_date
            });
            if (!success) throw error;
        }

        if (newIngredient.is_sellable) {
            const { data: updatedIngredient, error: refetchError } = await supabase.from('ingredients').select('*').eq('id', newIngredient.id).single();
            if (refetchError) throw refetchError;
            
            const { success, error } = await this.createOrUpdateProxyRecipe(updatedIngredient);
            if (!success) throw error;
        }
        
        const { data: finalIngredient, error: finalError } = await supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('id', newIngredient.id).single();
        if (finalError) throw finalError;

        return { success: true, error: null, data: finalIngredient as Ingredient };

    } catch (error) {
        await supabase.from('ingredients').delete().eq('id', newIngredient.id);
        return { success: false, error, data: undefined };
    }
  }
  
  async updateIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean; error: any }> {
    const { data: currentIngredient, error: fetchError } = await supabase.from('ingredients').select('*').eq('id', ingredient.id!).single();
    if (fetchError) return { success: false, error: fetchError };

    const { id, stock, ...updateData } = ingredient;

    const wasSellable = currentIngredient.is_sellable;
    const isNowSellable = updateData.is_sellable;

    if (wasSellable !== isNowSellable) {
      if (isNowSellable) {
        const fullIngredientDataForProxy = { ...currentIngredient, ...updateData };
        const { success, error, proxyRecipeId } = await this.createOrUpdateProxyRecipe(fullIngredientDataForProxy as Ingredient);
        if (!success) return { success, error };
        updateData.proxy_recipe_id = proxyRecipeId;
      } else {
        if (currentIngredient.proxy_recipe_id) {
          await this.recipeDataService.deleteRecipe(currentIngredient.proxy_recipe_id);
        }
        updateData.proxy_recipe_id = null;
      }
    } else if (isNowSellable && currentIngredient.proxy_recipe_id) {
      if (updateData.name !== currentIngredient.name || updateData.price !== currentIngredient.price) {
        await supabase.from('recipes').update({ name: updateData.name, price: updateData.price }).eq('id', currentIngredient.proxy_recipe_id);
      }
    }
    
    const { error } = await supabase.from('ingredients').update(updateData).eq('id', id!);
    return { success: !error, error };
  }
  
  // ... existing createOrUpdateProxyRecipe ...
  private async createOrUpdateProxyRecipe(ingredient: Ingredient): Promise<{ success: boolean, error: any, proxyRecipeId?: string }> {
     if (!ingredient.price || ingredient.price <= 0) {
        return { success: false, error: { message: 'Preço de venda deve ser definido para um item vendável.' } };
      }
      if (!ingredient.pos_category_id) {
         return { success: false, error: { message: 'Uma "Categoria no PDV" deve ser selecionada.' } };
      }
      if (!ingredient.station_id) {
          return { success: false, error: { message: 'Uma "Estação KDS" deve ser selecionada.' } };
      }

      const { data: recipe, error: recipeError } = await this.recipeDataService.addRecipe({
          name: ingredient.name,
          price: ingredient.price,
          is_available: true,
          source_ingredient_id: ingredient.id,
          category_id: ingredient.pos_category_id,
          is_sub_recipe: false,
          prep_time_in_minutes: 0,
      });

      if (recipeError) return { success: false, error: recipeError };

      const userId = this.getActiveUnitId();
      const prep: RecipePreparation = {
          id: uuidv4(),
          recipe_id: recipe!.id,
          station_id: ingredient.station_id,
          name: 'Entrega',
          display_order: 0,
          created_at: new Date().toISOString(),
          user_id: userId!,
      };
      
      const recipeIngredient: RecipeIngredient = {
          recipe_id: recipe!.id,
          ingredient_id: ingredient.id!,
          quantity: 1,
          preparation_id: prep.id,
          user_id: userId!,
      };
      
      await this.recipeDataService.saveTechnicalSheet(recipe!.id, {}, [prep], [recipeIngredient], []);

      const { error: updateError } = await supabase.from('ingredients').update({ proxy_recipe_id: recipe!.id }).eq('id', ingredient.id!);
      if (updateError) return { success: false, error: updateError };
      
      return { success: true, error: null, proxyRecipeId: recipe!.id };
  }

  async deleteIngredient(id: string): Promise<{ success: boolean; error: any }> {
    const { data: ingredient, error: fetchError } = await supabase.from('ingredients').select('proxy_recipe_id').eq('id', id).single();
    if(fetchError) return { success: false, error: fetchError };

    if(ingredient?.proxy_recipe_id) {
        await this.recipeDataService.deleteRecipe(ingredient.proxy_recipe_id);
    }
    
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    return { success: !error, error };
  }

  // --- CRITICAL UPDATE: AUDIT LOGGING ---
   async adjustIngredientStock(params: {
    ingredientId: string;
    quantityChange: number;
    reason: string;
    lotIdForExit?: string | null;
    lotNumberForEntry?: string | null;
    expirationDateForEntry?: string | null;
    employeeId?: string | null; // AUDIT: Capture who performed the adjustment
  }): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const {
        ingredientId,
        quantityChange,
        reason,
        lotIdForExit = null,
        lotNumberForEntry = null,
        expirationDateForEntry = null,
        employeeId = null // Default to null if not provided
    } = params;

    const { data: originalIngredient, error: fetchError } = await supabase
        .from('ingredients')
        .select('name, stock, unit')
        .eq('id', ingredientId)
        .single();
    
    if (fetchError) {
        return { success: false, error: fetchError };
    }
        
    const { error } = await supabase.rpc('adjust_stock_by_lot', {
        p_ingredient_id: ingredientId,
        p_quantity_change: quantityChange,
        p_reason: reason,
        p_user_id: userId,
        p_lot_id_for_exit: lotIdForExit,
        p_lot_number_for_entry: lotNumberForEntry,
        p_expiration_date_for_entry: expirationDateForEntry,
    });

    if (error) {
        return { success: !error, error };
    }
    
    // AUDIT: Insert into inventory_logs (Phase 2 Requirement)
    const newStock = originalIngredient.stock + quantityChange;
    const { error: logError } = await supabase.from('inventory_logs').insert({
        user_id: userId,
        ingredient_id: ingredientId,
        employee_id: employeeId, // Traceability!
        quantity_change: quantityChange,
        previous_balance: originalIngredient.stock,
        new_balance: newStock,
        reason: reason
    });

    if (logError) {
        console.error("Failed to insert inventory log audit trail:", logError);
    }

    const webhookPayload = {
        ingredientId: ingredientId,
        ingredientName: originalIngredient.name,
        quantityChange: quantityChange,
        newStock: newStock,
        unit: originalIngredient.unit,
        reason: reason
    };
    this.webhookService.triggerWebhook('stock.updated', webhookPayload);

    return { success: true, error: null };
  }

  // --- Helper to consume from station with fallback to central ---
  private async consumeStockFromStation(
      stationId: string | null, 
      ingredientId: string, 
      quantityNeeded: number, 
      reason: string,
      employeeId: string | null // AUDIT
  ): Promise<boolean> {
      const userId = this.getActiveUnitId();
      if (!userId) return false;

      let remainingNeeded = quantityNeeded;

      // 1. Try to consume from Station Stock first
      if (stationId) {
          const { data: stationStock } = await supabase
              .from('station_stocks')
              .select('id, quantity')
              .eq('station_id', stationId)
              .eq('ingredient_id', ingredientId)
              .maybeSingle();

          if (stationStock) {
              const consumedFromStation = Math.min(stationStock.quantity, remainingNeeded);
              if (consumedFromStation > 0) {
                  await supabase.from('station_stocks')
                      .update({ 
                          quantity: stationStock.quantity - consumedFromStation,
                          updated_at: new Date().toISOString()
                      })
                      .eq('id', stationStock.id);
                  
                  remainingNeeded -= consumedFromStation;
              }
          }
      }

      // 2. If there is still need, consume from Central (Ingredients)
      // This happens if station stock is empty or not enough.
      if (remainingNeeded > 0) {
          const result = await this.adjustIngredientStock({
              ingredientId: ingredientId,
              quantityChange: -remainingNeeded,
              reason: `${reason} (Fallback Central/Sem Estoque Praça)`,
              employeeId: employeeId // Audit passed
          });
          if (!result.success) return false;
      }
      
      return true;
  }

  // ... existing category / supplier CRUD ...
  async addIngredientCategory(name: string): Promise<{ success: boolean, error: any, data?: IngredientCategory }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { data, error } = await supabase.from('ingredient_categories').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateIngredientCategory(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('ingredient_categories').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteIngredientCategory(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('ingredient_categories').delete().eq('id', id);
    return { success: !error, error };
  }

  async addSupplier(supplier: Partial<Supplier>): Promise<{ success: boolean, error: any, data?: Supplier }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { data, error } = await supabase.from('suppliers').insert({ ...supplier, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateSupplier(supplier: Partial<Supplier>): Promise<{ success: boolean, error: any }> {
    const { id, ...updateData } = supplier;
    const { error } = await supabase.from('suppliers').update(updateData).eq('id', id!);
    return { success: !error, error };
  }
  
  async deleteSupplier(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    return { success: !error, error };
  }
  
  // UPDATED: adjustStockForProduction with Audit
    async adjustStockForProduction(
        subRecipeId: string, 
        sourceIngredientId: string, 
        quantityProduced: number, 
        lotNumberForEntry: string | null, 
        stationId?: string,
        employeeId?: string | null // AUDIT
    ): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const recipeComposition = this.recipeState.recipeCosts().get(subRecipeId);
    if (!recipeComposition) {
      return { success: false, error: { message: `Recipe composition not found for ${subRecipeId}` } };
    }
    
    try {
      const deductionReason = `Produção da sub-receita (ID: ${subRecipeId.slice(0, 8)})`;
      
      // Consume raw ingredients
      for (const [ingredientId, quantityNeeded] of recipeComposition.rawIngredients.entries()) {
        const totalDeduction = quantityNeeded * quantityProduced;
        
        // Audit passed down
        const success = await this.consumeStockFromStation(stationId || null, ingredientId, totalDeduction, deductionReason, employeeId || null);
        if (!success) throw new Error(`Failed to consume stock for ingredient ${ingredientId}`);
      }

      // Add the produced item
      const additionReason = `Produção da sub-receita (ID: ${subRecipeId.slice(0, 8)})`;
      const { success, error } = await this.adjustIngredientStock({ 
          ingredientId: sourceIngredientId, 
          quantityChange: quantityProduced, 
          reason: additionReason,
          lotNumberForEntry: lotNumberForEntry,
          expirationDateForEntry: null,
          employeeId: employeeId // Audit
      });
      if (!success) throw error;
      
      const newUnitCost = recipeComposition.totalCost;
      const { error: costUpdateError } = await supabase
        .from('ingredients')
        .update({ cost: newUnitCost })
        .eq('id', sourceIngredientId);
      
      if (costUpdateError) console.error(`Production stock updated, but failed to update cost:`, costUpdateError);
      
      return { success: true, error: null };
    } catch (error) {
      console.error("Stock adjustment for production failed.", error);
      return { success: false, error };
    }
  }

   // UPDATED: deductStockForOrderItems with Audit
   async deductStockForOrderItems(orderItems: OrderItem[], orderId: string, closingEmployeeId?: string | null): Promise<{ success: boolean; error: any; warningMessage?: string }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const recipeCompositions = this.recipeState.recipeDirectComposition();
    const processedGroupIds = new Set<string>();
    
    // Map: StationID -> { IngredientID -> TotalQty }
    const stationDeductions = new Map<string, Map<string, number>>();

    for (const item of orderItems) {
      if (!item.recipe_id) continue;
      if (item.group_id) {
        if (processedGroupIds.has(item.group_id)) continue; 
        processedGroupIds.add(item.group_id);
      }
      
      const composition = recipeCompositions.get(item.recipe_id);
      if (composition) {
        const targetStationId = item.station_id; 

        if (!stationDeductions.has(targetStationId)) {
            stationDeductions.set(targetStationId, new Map());
        }
        const stationMap = stationDeductions.get(targetStationId)!;

        const addToMap = (ingId: string, qty: number) => {
            stationMap.set(ingId, (stationMap.get(ingId) || 0) + qty);
        };

        for (const ing of composition.directIngredients) {
          addToMap(ing.ingredientId, ing.quantity * item.quantity);
        }
        for (const subIng of composition.subRecipeIngredients) {
            addToMap(subIng.ingredientId, subIng.quantity * item.quantity);
        }
      }
    }

    if (stationDeductions.size === 0) {
      return { success: true, error: null };
    }

    try {
      const reason = `Venda Pedido #${orderId.slice(0, 8)}`;

      for (const [stationId, ingredientsNeeded] of stationDeductions.entries()) {
        for (const [ingredientId, quantityNeeded] of ingredientsNeeded.entries()) {
             if (quantityNeeded <= 0) continue;

             // AUDIT: Pass the employee who closed the order
             await this.consumeStockFromStation(stationId, ingredientId, quantityNeeded, reason, closingEmployeeId || null);
        }
      }
      
      return { success: true, error: null };

    } catch (error) {
      return { success: false, error };
    }
  }

  // ... existing calculateIngredientUsageForPeriod ...
   async calculateIngredientUsageForPeriod(startDate: Date, endDate: Date): Promise<Map<string, number>> {
    const userId = this.getActiveUnitId();
    if (!userId) return new Map();

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .eq('status', 'COMPLETED')
      .gte('completed_at', startDate.toISOString())
      .lte('completed_at', endDate.toISOString());

    if (error || !orders) return new Map();

    const recipeCosts = this.recipeState.recipeCosts();
    const usageMap = new Map<string, number>();
    
    for (const order of orders) {
      const processedGroupIds = new Set<string>();
      for (const item of order.order_items) {
        if (item.group_id) {
          if (processedGroupIds.has(item.group_id)) continue;
          processedGroupIds.add(item.group_id);

          const representativeItem = order.order_items.find(i => i.group_id === item.group_id);
          if (!representativeItem || !representativeItem.recipe_id) continue;

          const recipeComposition = recipeCosts.get(representativeItem.recipe_id);
          if (recipeComposition?.rawIngredients) {
            for (const [ingId, qtyNeeded] of recipeComposition.rawIngredients.entries()) {
              const totalUsed = qtyNeeded * representativeItem.quantity;
              usageMap.set(ingId, (usageMap.get(ingId) || 0) + totalUsed);
            }
          }
        } else {
          if (!item.recipe_id) continue;
          const recipeComposition = recipeCosts.get(item.recipe_id);
          if (recipeComposition?.rawIngredients) {
            for (const [ingId, qtyNeeded] of recipeComposition.rawIngredients.entries()) {
              const totalUsed = qtyNeeded * item.quantity;
              usageMap.set(ingId, (usageMap.get(ingId) || 0) + totalUsed);
            }
          }
        }
      }
    }
    return usageMap;
  }
  
  async logLabelCreation(labelData: Partial<LabelLog>): Promise<{ success: boolean; error: any }> {
      const userId = this.getActiveUnitId();
      if (!userId) return { success: false, error: { message: 'Active unit not found' } };

      const { error } = await supabase
          .from('label_logs')
          .insert({
              ...labelData,
              user_id: userId
          });
          
      return { success: !error, error };
  }

  async getLabelLogs(limit = 50): Promise<{ data: LabelLog[]; error: any }> {
      const userId = this.getActiveUnitId();
      if (!userId) return { data: [], error: { message: 'Active unit not found' } };

      const { data, error } = await supabase
          .from('label_logs')
          .select('*, employees(name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
          
      return { data: data || [], error };
  }
}
