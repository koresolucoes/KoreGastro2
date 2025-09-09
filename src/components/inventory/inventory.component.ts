




import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ingredient, IngredientUnit, IngredientCategory, Supplier, Category, Station } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { AiRecipeService } from '../../services/ai-recipe.service';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';

const EMPTY_INGREDIENT: Partial<Ingredient> = {
    name: '',
    unit: 'un',
    stock: 0,
    cost: 0,
    min_stock: 0,
    category_id: null,
    supplier_id: null,
    expiration_date: null,
    is_sellable: false,
    price: null,
    pos_category_id: null,
    station_id: null,
};

type DashboardFilter = 'all' | 'low_stock' | 'expiring_soon' | 'stagnant';

interface StockPrediction {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  unit: string;
  predictedUsage: number;
  suggestedPurchase: number;
}


@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
    stateService = inject(SupabaseStateService);
    inventoryDataService = inject(InventoryDataService);
    aiService = inject(AiRecipeService);
    router = inject(Router);
    notificationService = inject(NotificationService);
    
    ingredients = this.stateService.ingredients;
    categories = this.stateService.ingredientCategories;
    suppliers = this.stateService.suppliers;
    recipeCategories = this.stateService.categories;
    stations = this.stateService.stations;
    
    isModalOpen = signal(false);
    editingIngredient = signal<Partial<Ingredient> | null>(null);
    ingredientForm = signal<Partial<Ingredient>>(EMPTY_INGREDIENT);
    
    isAdjustmentModalOpen = signal(false);
    adjustmentIngredient = signal<Ingredient | null>(null);
    adjustmentQuantity = signal(0);
    adjustmentType = signal<'entry' | 'exit'>('entry');
    adjustmentReason = signal('');
    adjustmentCustomReason = signal('');
    adjustmentSupplierId = signal<string | null>(null);
    adjustmentExpirationDate = signal<string | null>(null);

    ingredientPendingDeletion = signal<Ingredient | null>(null);

    activeDashboardFilter = signal<DashboardFilter>('all');
    activeCategoryFilter = signal<string | null>(null);
    searchTerm = signal('');

    // AI Prediction State
    isAnalyzingStock = signal(false);
    stockPrediction = signal<StockPrediction[] | null>(null);

    hasItemsToOrder = computed(() => {
        const predictions = this.stockPrediction();
        if (!predictions) {
            return false;
        }
        return predictions.some(p => p.suggestedPurchase > 0);
    });

    availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];
    entryReasons = ['Compra de Fornecedor', 'Devolução', 'Correção de Contagem', 'Outro'];
    exitReasons = ['Perda / Quebra', 'Vencimento', 'Consumo Interno', 'Outro'];

    totalInventoryCost = computed(() => this.ingredients().reduce((sum, item) => sum + (item.stock * item.cost), 0));
    lowStockCount = computed(() => this.ingredients().filter(i => this.isLowStock(i.stock, i.min_stock)).length);
    expiringSoonCount = computed(() => this.ingredients().filter(i => this.isExpiringSoon(i.expiration_date)).length);
    stagnantStockCount = computed(() => this.ingredients().filter(i => this.isStagnant(i.last_movement_at)).length);

    filteredIngredients = computed(() => {
        const dashboardFilter = this.activeDashboardFilter();
        const categoryFilter = this.activeCategoryFilter();
        const term = this.searchTerm().toLowerCase();
        let ingredients = this.ingredients();

        if (categoryFilter) {
            ingredients = ingredients.filter(i => i.category_id === categoryFilter);
        }

        let filteredByDashboard: Ingredient[];
        switch (dashboardFilter) {
            case 'low_stock': filteredByDashboard = ingredients.filter(i => this.isLowStock(i.stock, i.min_stock)); break;
            case 'expiring_soon': filteredByDashboard = ingredients.filter(i => this.isExpiringSoon(i.expiration_date)); break;
            case 'stagnant': filteredByDashboard = ingredients.filter(i => this.isStagnant(i.last_movement_at)); break;
            default: filteredByDashboard = ingredients;
        }
        
        if (!term) return filteredByDashboard;
        return filteredByDashboard.filter(i => i.name.toLowerCase().includes(term));
    });
    
    stockAfterAdjustment = computed(() => {
        const ingredient = this.adjustmentIngredient();
        if (!ingredient) return 0;
        const change = this.adjustmentType() === 'entry' ? this.adjustmentQuantity() : -this.adjustmentQuantity();
        return ingredient.stock + change;
    });

    setDashboardFilter(filter: DashboardFilter) { this.activeDashboardFilter.set(filter); }
    setCategoryFilter(categoryId: string | null) { this.activeCategoryFilter.set(categoryId); }

    isLowStock(stock: number, minStock: number): boolean { return stock < minStock; }
    isExpiringSoon(expirationDate?: string | null): boolean {
        if (!expirationDate) return false;
        const today = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(today.getDate() + 7);
        const expDate = new Date(expirationDate);
        return expDate <= sevenDaysFromNow && expDate >= today;
    }
    isStagnant(lastMovementDate?: string | null): boolean {
        if (!lastMovementDate) return true;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return new Date(lastMovementDate) < thirtyDaysAgo;
    }

    openAddModal() {
        this.ingredientForm.set({ ...EMPTY_INGREDIENT, category_id: this.categories()[0]?.id ?? null, supplier_id: this.suppliers()[0]?.id ?? null });
        this.editingIngredient.set(null);
        this.isModalOpen.set(true);
    }
    
    openEditModal(ingredient: Ingredient) {
        this.editingIngredient.set(ingredient);
        this.ingredientForm.set({ ...ingredient });
        this.isModalOpen.set(true);
    }
    
    closeModal() {
        this.isModalOpen.set(false);
        this.editingIngredient.set(null);
    }

    updateFormValue(field: keyof Omit<Ingredient, 'id' | 'created_at' | 'ingredient_categories' | 'suppliers'>, value: any) {
        this.ingredientForm.update(form => {
            const newForm = { ...form };
            if (field === 'is_sellable') {
                newForm[field] = value as boolean;
// FIX: Cast `field` to string for `includes` method check.
            } else if (['category_id', 'supplier_id', 'pos_category_id', 'station_id', 'expiration_date'].includes(field as string)) {
                newForm[field as 'category_id' | 'supplier_id' | 'pos_category_id' | 'station_id' | 'expiration_date'] = (value === 'null' || value === '') ? null : value;
// FIX: Cast `field` to string for `includes` method check.
            } else if (['name', 'unit', 'last_movement_at'].includes(field as string)) {
                newForm[field as 'name' | 'unit' | 'last_movement_at'] = value;
// FIX: Cast `field` to string for `includes` method check.
            } else if (['stock', 'cost', 'min_stock', 'price'].includes(field as string)) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    newForm[field as 'stock' | 'cost' | 'min_stock' | 'price'] = numValue;
                }
            }
            return newForm;
        });
    }

    async saveIngredient() {
        const formValue = this.ingredientForm();
        if (!formValue.name?.trim()) {
          await this.notificationService.alert('O nome do ingrediente é obrigatório.');
          return;
        }

        const { ingredient_categories, suppliers, ...dbFormValue } = formValue;
        const result = this.editingIngredient()?.id
            ? await this.inventoryDataService.updateIngredient({ ...dbFormValue, id: this.editingIngredient()!.id! })
            : await this.inventoryDataService.addIngredient(dbFormValue);

        if (result.success) this.closeModal();
        else await this.notificationService.alert(`Falha ao salvar. Erro: ${result.error?.message}`);
    }

    openAdjustmentModal(ingredient: Ingredient) {
        this.adjustmentIngredient.set(ingredient);
        this.adjustmentQuantity.set(0);
        this.adjustmentType.set('entry');
        this.adjustmentReason.set(this.entryReasons[0]);
        this.adjustmentCustomReason.set('');
        this.adjustmentSupplierId.set(null);
        this.adjustmentExpirationDate.set(ingredient.expiration_date || null);
        this.isAdjustmentModalOpen.set(true);
    }

    closeAdjustmentModal() { this.isAdjustmentModalOpen.set(false); }
    
    setAdjustmentType(type: 'entry' | 'exit') {
        this.adjustmentType.set(type);
        this.adjustmentReason.set(type === 'entry' ? this.entryReasons[0] : this.exitReasons[0]);
        this.adjustmentSupplierId.set(null);
        this.adjustmentCustomReason.set('');
        this.adjustmentQuantity.set(0);
    }

    async handleAdjustStock() {
        const ingredient = this.adjustmentIngredient();
        const quantity = this.adjustmentQuantity();
        if (!ingredient || quantity <= 0) {
          await this.notificationService.alert('A quantidade deve ser maior que zero.');
          return;
        }
        if (this.adjustmentType() === 'exit' && quantity > ingredient.stock) {
          await this.notificationService.alert('Saída maior que o estoque.');
          return;
        }

        let finalReason = this.adjustmentReason();
        if (finalReason === 'Outro') {
            finalReason = this.adjustmentCustomReason().trim();
            if (!finalReason) {
              await this.notificationService.alert('Especifique o motivo.');
              return;
            }
        } else if (finalReason === 'Compra de Fornecedor' && this.adjustmentSupplierId()) {
            const supplierName = this.suppliers().find(s => s.id === this.adjustmentSupplierId())?.name;
            if (supplierName) finalReason = `${finalReason} - ${supplierName}`;
        }
        
        const result = await this.inventoryDataService.adjustIngredientStock(ingredient.id, this.adjustmentType() === 'entry' ? quantity : -quantity, finalReason, this.adjustmentType() === 'entry' ? this.adjustmentExpirationDate() : null);
        if (result.success) this.closeAdjustmentModal();
        else await this.notificationService.alert(`Falha ao ajustar estoque. Erro: ${result.error?.message}`);
    }

    requestDeleteIngredient(ingredient: Ingredient) { this.ingredientPendingDeletion.set(ingredient); }
    cancelDeleteIngredient() { this.ingredientPendingDeletion.set(null); }
    
    async confirmDeleteIngredient() {
        const ingredient = this.ingredientPendingDeletion();
        if (ingredient) {
            const result = await this.inventoryDataService.deleteIngredient(ingredient.id);
            if (!result.success) await this.notificationService.alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            this.ingredientPendingDeletion.set(null);
        }
    }

    async predictStockNeeds() {
        this.isAnalyzingStock.set(true);
        this.stockPrediction.set(null);
        try {
            const ingredientsById = new Map(this.ingredients().map(i => [i.id, i]));
            
            // Step 1: Initialize predictions for ALL ingredients
            const predictionsMap = new Map<string, StockPrediction>();
            this.ingredients().forEach(ingredient => {
                predictionsMap.set(ingredient.id, {
                    ingredientId: ingredient.id,
                    ingredientName: ingredient.name,
                    currentStock: ingredient.stock,
                    unit: ingredient.unit,
                    predictedUsage: 0,
                    suggestedPurchase: 0 // Will be calculated later
                });
            });

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 28); // last 4 weeks

            const usageData = await this.inventoryDataService.calculateIngredientUsageForPeriod(startDate, endDate);
            
            if (usageData.size === 0) {
                // Step 3a: No sales data, use min_stock
                await this.notificationService.alert(
                    "Não há dados de vendas recentes para fazer uma previsão com IA. A sugestão de compra será baseada no seu estoque mínimo.",
                    "Análise de Estoque"
                );
                
                predictionsMap.forEach((prediction, ingredientId) => {
                    const ingredient = ingredientsById.get(ingredientId)!;
                    const suggestedPurchase = Math.max(0, ingredient.min_stock - ingredient.stock);
                    prediction.suggestedPurchase = Math.ceil(suggestedPurchase);
                });

            } else {
                // Step 2: Sales data exists, call AI
                const historicalDataString = Array.from(usageData.entries())
                  .map(([id, quantity]) => `${ingredientsById.get(id)?.name}: ${quantity.toFixed(2)} ${ingredientsById.get(id)?.unit} por mês`)
                  .join(', ');
                
                const prompt = `Com base no consumo histórico de ingredientes de um restaurante (${historicalDataString}), preveja a necessidade de cada ingrediente para a PRÓXIMA SEMANA. Retorne um JSON array com "ingredientId", "predictedUsage".`;

                const aiResult = await this.aiService.callGeminiForPrediction(prompt);

                // Step 2b: Update map with AI predictions
                aiResult.forEach((p: any) => {
                    const prediction = predictionsMap.get(p.ingredientId);
                    if (prediction) {
                        const suggestedPurchase = Math.max(0, p.predictedUsage - prediction.currentStock);
                        prediction.predictedUsage = p.predictedUsage;
                        prediction.suggestedPurchase = Math.ceil(suggestedPurchase);
                    }
                });
            }

            // Step 4: Finalize and set state
            const finalPredictions = Array.from(predictionsMap.values())
                .sort((a, b) => b.suggestedPurchase - a.suggestedPurchase || b.predictedUsage - a.predictedUsage);
            
            this.stockPrediction.set(finalPredictions);

        } catch (error) {
            await this.notificationService.alert(`Erro ao analisar o estoque: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        } finally {
            this.isAnalyzingStock.set(false);
        }
    }

    async generatePurchaseOrder() {
        const itemsToOrder = this.stockPrediction()
            ?.filter(p => p.suggestedPurchase > 0)
            .map(p => ({
                ingredientId: p.ingredientId,
                quantity: p.suggestedPurchase,
            }));

        if (itemsToOrder && itemsToOrder.length > 0) {
            this.router.navigate(['/purchasing'], { state: { newOrderItems: itemsToOrder } });
        } else {
            await this.notificationService.alert("Nenhum item com sugestão de compra.");
        }
    }
}
