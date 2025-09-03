
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ingredient, IngredientUnit, IngredientCategory, Supplier } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { AiRecipeService } from '../../services/ai-recipe.service';
import { Router } from '@angular/router';

const EMPTY_INGREDIENT: Partial<Ingredient> = {
    name: '',
    unit: 'un',
    stock: 0,
    cost: 0,
    min_stock: 0,
    category_id: null,
    supplier_id: null,
    expiration_date: null,
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
    
    ingredients = this.stateService.ingredients;
    categories = this.stateService.ingredientCategories;
    suppliers = this.stateService.suppliers;
    
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

    updateFormValue(field: keyof Omit<Ingredient, 'id' | 'created_at' | 'ingredient_categories' | 'suppliers'>, value: string) {
        this.ingredientForm.update(form => {
            const newForm = { ...form };
            if (field === 'category_id' || field === 'supplier_id') newForm[field] = (value === 'null' || value === '') ? null : value;
            else if (field === 'name' || field === 'unit' || field === 'expiration_date' || field === 'last_movement_at') newForm[field] = value as any;
            else if (field === 'stock' || field === 'cost' || field === 'min_stock') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) newForm[field] = numValue;
            }
            return newForm;
        });
    }

    async saveIngredient() {
        const formValue = this.ingredientForm();
        if (!formValue.name?.trim()) { alert('O nome do ingrediente é obrigatório.'); return; }

        const { ingredient_categories, suppliers, ...dbFormValue } = formValue;
        const result = this.editingIngredient()?.id
            ? await this.inventoryDataService.updateIngredient({ ...dbFormValue, id: this.editingIngredient()!.id! })
            : await this.inventoryDataService.addIngredient(dbFormValue);

        if (result.success) this.closeModal();
        else alert(`Falha ao salvar. Erro: ${result.error?.message}`);
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
        if (!ingredient || quantity <= 0) { alert('A quantidade deve ser maior que zero.'); return; }
        if (this.adjustmentType() === 'exit' && quantity > ingredient.stock) { alert('Saída maior que o estoque.'); return; }

        let finalReason = this.adjustmentReason();
        if (finalReason === 'Outro') {
            finalReason = this.adjustmentCustomReason().trim();
            if (!finalReason) { alert('Especifique o motivo.'); return; }
        } else if (finalReason === 'Compra de Fornecedor' && this.adjustmentSupplierId()) {
            const supplierName = this.suppliers().find(s => s.id === this.adjustmentSupplierId())?.name;
            if (supplierName) finalReason = `${finalReason} - ${supplierName}`;
        }
        
        const result = await this.inventoryDataService.adjustIngredientStock(ingredient.id, this.adjustmentType() === 'entry' ? quantity : -quantity, finalReason, this.adjustmentType() === 'entry' ? this.adjustmentExpirationDate() : null);
        if (result.success) this.closeAdjustmentModal();
        else alert(`Falha ao ajustar estoque. Erro: ${result.error?.message}`);
    }

    requestDeleteIngredient(ingredient: Ingredient) { this.ingredientPendingDeletion.set(ingredient); }
    cancelDeleteIngredient() { this.ingredientPendingDeletion.set(null); }
    
    async confirmDeleteIngredient() {
        const ingredient = this.ingredientPendingDeletion();
        if (ingredient) {
            const result = await this.inventoryDataService.deleteIngredient(ingredient.id);
            if (!result.success) alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            this.ingredientPendingDeletion.set(null);
        }
    }

    async predictStockNeeds() {
        this.isAnalyzingStock.set(true);
        this.stockPrediction.set(null);
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 28); // last 4 weeks

            const usageData = await this.inventoryDataService.calculateIngredientUsageForPeriod(startDate, endDate);
            
            if (usageData.size === 0) {
                alert("Não há dados de vendas suficientes no último mês para fazer uma previsão.");
                return;
            }

            const ingredientsById = new Map(this.ingredients().map(i => [i.id, i]));
            const historicalDataString = Array.from(usageData.entries())
              .map(([id, quantity]) => `${ingredientsById.get(id)?.name}: ${quantity.toFixed(2)} ${ingredientsById.get(id)?.unit} por mês`)
              .join(', ');
            
            const prompt = `Com base no consumo histórico de ingredientes de um restaurante (${historicalDataString}), preveja a necessidade de cada ingrediente para a PRÓXIMA SEMANA. Retorne um JSON array com "ingredientId", "predictedUsage".`;

            const aiResult = await this.aiService.callGeminiForPrediction(prompt);

            const predictions: StockPrediction[] = aiResult.map((p: any) => {
                const ingredient = ingredientsById.get(p.ingredientId);
                if (!ingredient) return null;
                const suggestedPurchase = Math.max(0, p.predictedUsage - ingredient.stock);
                return {
                    ingredientId: p.ingredientId,
                    ingredientName: ingredient.name,
                    currentStock: ingredient.stock,
                    unit: ingredient.unit,
                    predictedUsage: p.predictedUsage,
                    suggestedPurchase: Math.ceil(suggestedPurchase)
                };
            }).filter((p: any) => p !== null);
            
            this.stockPrediction.set(predictions);

        } catch (error) {
            alert(`Erro ao analisar o estoque: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        } finally {
            this.isAnalyzingStock.set(false);
        }
    }

    generatePurchaseOrder() {
        const itemsToOrder = this.stockPrediction()
            ?.filter(p => p.suggestedPurchase > 0)
            .map(p => ({
                ingredientId: p.ingredientId,
                quantity: p.suggestedPurchase,
            }));

        if (itemsToOrder && itemsToOrder.length > 0) {
            this.router.navigate(['/purchasing'], { state: { newOrderItems: itemsToOrder } });
        } else {
            alert("Nenhum item com sugestão de compra.");
        }
    }
}
