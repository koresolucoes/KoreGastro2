
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Ingredient, IngredientUnit, IngredientCategory, Supplier, PurchaseOrder, PurchaseOrderStatus, Recipe, Ingredient as IngredientModel, LabelLog } from '../../models/db.models';
import { InventoryStateService } from '../../services/inventory-state.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { AiRecipeService } from '../../services/ai-recipe.service';
import { NotificationService } from '../../services/notification.service';
import { IngredientDetailsModalComponent } from './ingredient-details-modal/ingredient-details-modal.component';
import { PurchasingDataService } from '../../services/purchasing-data.service';
import { FormsModule } from '@angular/forms';
import { RecipeStateService } from '../../services/recipe-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { LabelGeneratorModalComponent } from '../shared/label-generator-modal/label-generator-modal.component';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { InventoryLogsComponent } from './inventory-logs/inventory-logs.component';

const EMPTY_INGREDIENT: Partial<Ingredient> = {
    name: '',
    unit: 'un',
    cost: 0,
    stock: 0,
    min_stock: 0,
    is_portionable: false,
    is_yield_product: false,
    standard_portion_weight_g: null,
    shelf_life_after_open_days: 3,
    storage_conditions: 'Refrigerado (0º a 5ºC)'
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

type FormItem = {
    id: string; 
    ingredient_id: string;
    quantity: number;
    cost: number;
    name: string;
    unit: string;
    lot_number: string | null;
    expiration_date: string | null;
};


@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, IngredientDetailsModalComponent, RouterLink, FormsModule, LabelGeneratorModalComponent, InventoryLogsComponent],
  templateUrl: './inventory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent implements OnInit {
    inventoryState = inject(InventoryStateService);
    recipeState = inject(RecipeStateService);
    posState = inject(PosStateService);
    inventoryDataService = inject(InventoryDataService);
    aiService = inject(AiRecipeService);
    router: Router = inject(Router);
    notificationService = inject(NotificationService);
    purchasingDataService = inject(PurchasingDataService);
    supabaseStateService = inject(SupabaseStateService);
    operationalAuthService = inject(OperationalAuthService);
    
    ingredients = this.inventoryState.ingredients;
    categories = this.inventoryState.ingredientCategories;
    suppliers = this.inventoryState.suppliers;
    recipeCategories = this.recipeState.categories;
    stations = this.posState.stations;
    activeEmployee = this.operationalAuthService.activeEmployee; // Used for audit
    
    // View State - Added 'logs'
    viewTab = signal<'inventory' | 'labels' | 'logs'>('inventory');
    labelLogs = signal<LabelLog[]>([]);

    // ... (rest of signals remain the same)
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
    adjustmentLotNumber = signal<string | null>(null);

    ingredientPendingDeletion = signal<Ingredient | null>(null);

    activeDashboardFilter = signal<DashboardFilter>('all');
    activeCategoryFilter = signal<string | null>(null);
    searchTerm = signal('');

    // AI Prediction State
    isAnalyzingStock = signal(false);
    stockPrediction = signal<StockPrediction[] | null>(null);

    // Ingredient Details Modal State
    isDetailsModalOpen = signal(false);
    selectedIngredientForDetails = signal<Ingredient | null>(null);
    
    // Label Modal
    isLabelModalOpen = signal(false);
    selectedLabelItem = signal<Ingredient | null>(null);

    // --- Purchase Order Modal State ---
    isPurchaseOrderModalOpen = signal(false);
    poForm = signal<{ supplier_id: string | null, status: PurchaseOrderStatus, notes: string }>({ supplier_id: null, status: 'Rascunho', notes: '' });
    poItems = signal<FormItem[]>([]);
    poItemSearchTerm = signal('');
    isSavingPO = signal(false);

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

    lotsForSelectedIngredient = computed(() => {
      const ingredient = this.selectedIngredientForDetails();
      if (!ingredient) return [];
      return this.inventoryState.inventoryLots()
        .filter(lot => lot.ingredient_id === ingredient.id && lot.quantity > 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    lotsForAdjustmentModal = computed(() => {
      const ingredient = this.adjustmentIngredient();
      if (!ingredient) return [];
      return this.inventoryState.inventoryLots()
        .filter(lot => lot.ingredient_id === ingredient.id && lot.quantity > 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
    
    // --- Purchase Order Computeds ---
    poFilteredIngredients = computed(() => {
      const term = this.poItemSearchTerm().toLowerCase();
      if (!term) return [];
      return this.ingredients()
        .filter(i => i.name.toLowerCase().includes(term))
        .slice(0, 5);
    });

    poCurrentItemIds = computed(() => new Set(this.poItems().map(i => i.ingredient_id)));

    poTotal = computed(() => this.poItems().reduce((sum, item) => sum + (item.quantity * item.cost), 0));

    isAddingIngredient = signal(false);
    newIngredientForm = signal<Partial<IngredientModel>>(EMPTY_INGREDIENT);

    ngOnInit() {
        // Critical: Load heavy back-office data (POs, Lots) only when entering this component
        // Ingredients themselves are already loaded by 'loadEssentialData' in SupabaseStateService
        this.supabaseStateService.loadBackOfficeData();

        const navigationState = this.router.getCurrentNavigation()?.extras.state as any;
        if (navigationState && navigationState['newOrderItems']) {
            const prefillItems = navigationState['newOrderItems'] as { ingredientId: string, quantity: number }[];
            const ingredientsMap = new Map<string, Ingredient>(
                this.ingredients().map(i => [i.id, i])
            );
            
            const suppliersInOrder = new Map<string | null, { ingredientId: string, quantity: number }[]>();
            
            prefillItems.forEach(item => {
                const ingredient = ingredientsMap.get(item.ingredientId);
                const supplierId = ingredient?.supplier_id || null;
                
                if (!suppliersInOrder.has(supplierId)) {
                    suppliersInOrder.set(supplierId, []);
                }
                suppliersInOrder.get(supplierId)!.push(item);
            });
            
            if (suppliersInOrder.size > 0) {
                const firstSupplierId = suppliersInOrder.keys().next().value;
                const itemsForThisOrder = suppliersInOrder.get(firstSupplierId);
    
                this.openAddModal(itemsForThisOrder);
                this.poForm.update((form: any) => ({ ...form, supplier_id: firstSupplierId }));
            }
        }
    }

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

    openAddModal(prefillItems?: { ingredientId: string, quantity: number }[]) {
        if (prefillItems) {
            // Logic for Purchase Order modal (re-using this method name was confusing in original code, separating context)
            this.openPurchaseOrderModal(prefillItems);
            return;
        }

        this.ingredientForm.set({ ...EMPTY_INGREDIENT, category_id: this.categories()[0]?.id ?? null, supplier_id: this.suppliers()[0]?.id ?? null });
        this.editingIngredient.set(null);
        this.isModalOpen.set(true);
    }
    
    // ... (rest of methods)
    
    openPurchaseOrderModal(prefillItems?: { ingredientId: string, quantity: number }[]) {
        this.poForm.set({ supplier_id: this.suppliers()[0]?.id || null, status: 'Rascunho', notes: '' });
        
        if (prefillItems) {
            const items = prefillItems.map(item => {
                const ingredient = this.ingredients().find(i => i.id === item.ingredientId);
                return ingredient ? {
                    id: `temp-${ingredient.id}`,
                    ingredient_id: ingredient.id,
                    quantity: item.quantity,
                    cost: ingredient.cost,
                    name: ingredient.name,
                    unit: ingredient.unit,
                    lot_number: null,
                    expiration_date: null,
                } : null;
            }).filter(i => i !== null) as FormItem[];
            this.poItems.set(items);
        } else {
            this.poItems.set([]);
        }
        
        this.isPurchaseOrderModalOpen.set(true);
    }
    
    // ... (rest of the file remains same, ensure methods like openEditModal, closeModal, etc. are preserved)
    openEditModal(ingredient: Ingredient) {
        this.editingIngredient.set(ingredient);
        this.ingredientForm.set({ ...ingredient });
        this.isModalOpen.set(true);
    }
    
    closeModal() {
        this.isModalOpen.set(false);
        this.editingIngredient.set(null);
    }

    openDetailsModal(ingredient: Ingredient) {
        this.selectedIngredientForDetails.set(ingredient);
        this.isDetailsModalOpen.set(true);
    }
    
    // LABEL MODAL METHODS
    openLabelModal(ingredient: Ingredient | null) {
        this.selectedLabelItem.set(ingredient);
        this.isLabelModalOpen.set(true);
    }
    
    closeLabelModal() {
        this.isLabelModalOpen.set(false);
        this.selectedLabelItem.set(null);
        // Refresh logs if tab is active
        if (this.viewTab() === 'labels') {
            this.loadLabelLogs();
        }
    }
    
    async loadLabelLogs() {
        const { data, error } = await this.inventoryDataService.getLabelLogs();
        if(!error) this.labelLogs.set(data);
    }

    updateFormValue(field: keyof Omit<Ingredient, 'id' | 'created_at' | 'user_id' | 'ingredient_categories' | 'suppliers'>, value: any) {
        this.ingredientForm.update(form => {
            const newForm: Partial<Ingredient> = { ...form };
            
            switch (field) {
                case 'stock':
                case 'cost':
                case 'min_stock':
                case 'shelf_life_after_open_days': {
                    const numValue = parseFloat(value);
                    newForm[field] = isNaN(numValue) ? 0 : numValue;
                    break;
                }
                case 'price':
                case 'standard_portion_weight_g': {
                    const numValue = parseFloat(value);
                    newForm[field] = isNaN(numValue) ? null : numValue;
                    break;
                }
                case 'is_sellable':
                case 'is_portionable':
                case 'is_yield_product':
                    newForm[field] = value as boolean;
                    break;
                case 'name':
                case 'storage_conditions':
                    newForm[field] = value;
                    break;
                case 'unit':
                    newForm.unit = value as IngredientUnit;
                    break;
                case 'category_id':
                case 'supplier_id':
                case 'pos_category_id':
                case 'station_id':
                case 'proxy_recipe_id':
                case 'external_code':
                case 'expiration_date':
                case 'last_movement_at':
                    newForm[field] = (value === 'null' || value === '') ? null : value;
                    break;
                default:
                    break;
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

    // ... (rest of existing adjustment/PO logic) ...
    openAdjustmentModal(ingredient: Ingredient) {
        this.adjustmentIngredient.set(ingredient);
        this.adjustmentQuantity.set(0);
        this.adjustmentType.set('entry');
        this.adjustmentReason.set(this.entryReasons[0]);
        this.adjustmentCustomReason.set('');
        this.adjustmentSupplierId.set(null);
        this.adjustmentExpirationDate.set(ingredient.expiration_date || null);
        this.adjustmentLotNumber.set(null);
        this.isAdjustmentModalOpen.set(true);
    }

    closeAdjustmentModal() { this.isAdjustmentModalOpen.set(false); }
    
    setAdjustmentType(type: 'entry' | 'exit') {
        this.adjustmentType.set(type);
        this.adjustmentReason.set(type === 'entry' ? this.entryReasons[0] : this.exitReasons[0]);
        this.adjustmentSupplierId.set(null);
        this.adjustmentCustomReason.set('');
        this.adjustmentQuantity.set(0);
        this.adjustmentLotNumber.set(null);
    }

    async handleAdjustStock() {
        const ingredient = this.adjustmentIngredient();
        const quantity = this.adjustmentQuantity();
        const employeeId = this.activeEmployee()?.id; // AUDIT: Get active employee ID

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
        
        const params = {
            ingredientId: ingredient.id,
            quantityChange: this.adjustmentType() === 'entry' ? quantity : -quantity,
            reason: finalReason,
            lotNumberForEntry: this.adjustmentType() === 'entry' ? this.adjustmentLotNumber() : null,
            expirationDateForEntry: this.adjustmentType() === 'entry' ? this.adjustmentExpirationDate() : null,
            employeeId: employeeId // AUDIT: Pass it down
        };
        const result = await this.inventoryDataService.adjustIngredientStock(params);
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
            const ingredientsById = new Map<string, Ingredient>(this.ingredients().map(i => [i.id, i]));
            
            const predictionsMap = new Map<string, StockPrediction>();
            this.ingredients().forEach(ingredient => {
                predictionsMap.set(ingredient.id, {
                    ingredientId: ingredient.id,
                    ingredientName: ingredient.name,
                    currentStock: ingredient.stock,
                    unit: ingredient.unit,
                    predictedUsage: 0,
                    suggestedPurchase: 0
                });
            });

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 28);

            const usageData = await this.inventoryDataService.calculateIngredientUsageForPeriod(startDate, endDate);
            
            if (usageData.size === 0) {
                await this.notificationService.alert(
                    "Não há dados de vendas recentes para fazer uma previsão com IA. A sugestão de compra será baseada no seu estoque mínimo.",
                    "Análise de Estoque"
                );
                
                predictionsMap.forEach((prediction, ingredientId) => {
                    const ingredient = ingredientsById.get(ingredientId);
                    if (ingredient) {
                      const suggestedPurchase = Math.max(0, ingredient.min_stock - ingredient.stock);
                      prediction.suggestedPurchase = Math.ceil(suggestedPurchase);
                    }
                });

            } else {
                const historicalDataString = Array.from(usageData.entries())
                  .map(([id, quantity]) => {
                    const ingredient = ingredientsById.get(id);
                    if (ingredient) {
                        return `${ingredient.name}: ${quantity.toFixed(2)} ${ingredient.unit} por mês`;
                    }
                    return '';
                  })
                  .filter(Boolean)
                  .join(', ');
                
                const prompt = `Com base no consumo histórico de ingredientes de um restaurante (${historicalDataString}), preveja a necessidade de cada ingrediente para a PRÓXIMA SEMANA. Retorne um JSON array com "ingredientId", "predictedUsage".`;

                const aiResult = await this.aiService.callGeminiForPrediction(prompt);

                aiResult.forEach((p: { ingredientId: string; predictedUsage: number; }) => {
                    const prediction = predictionsMap.get(p.ingredientId);
                    if (prediction) {
                        const suggestedPurchase = Math.max(0, p.predictedUsage - prediction.currentStock);
                        prediction.predictedUsage = p.predictedUsage;
                        prediction.suggestedPurchase = Math.ceil(suggestedPurchase);
                    }
                });
            }

            const finalPredictions = Array.from(predictionsMap.values())
                .sort((a, b) => b.suggestedPurchase - a.suggestedPurchase || b.predictedUsage - a.predictedUsage);
            
            this.stockPrediction.set(finalPredictions);

        } catch (error) {
            await this.notificationService.alert(`Erro ao analisar o estoque: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
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
            this.openPurchaseOrderModal(itemsToOrder);
        } else {
            this.notificationService.alert("Nenhum item com sugestão de compra.");
        }
    }
    
    closePurchaseOrderModal() {
        this.isPurchaseOrderModalOpen.set(false);
    }

    updatePOFormField(field: 'supplier_id' | 'status' | 'notes', value: string) {
        this.poForm.update(f => ({
            ...f,
            [field]: field === 'supplier_id' ? (value === 'null' ? null : value) : value
        }));
    }
  
    async addPOItemToOrder(ingredient: Ingredient) {
        this.poItems.update(items => [...items, {
            id: `temp-${ingredient.id}`,
            ingredient_id: ingredient.id,
            quantity: 1,
            cost: ingredient.cost,
            name: ingredient.name,
            unit: ingredient.unit,
            lot_number: null,
            expiration_date: null,
        }]);
        this.poItemSearchTerm.set('');

        const currentSupplierId = this.poForm().supplier_id;
        if (!currentSupplierId && ingredient.supplier_id) {
            const supplierName = this.suppliers().find(s => s.id === ingredient.supplier_id)?.name;
            if (supplierName) {
                const confirmed = await this.notificationService.confirm(
                    `Este item é fornecido por "${supplierName}". Deseja definir este fornecedor para a ordem inteira?`,
                    'Sugerir Fornecedor'
                );
                if (confirmed) {
                    this.updatePOFormField('supplier_id', ingredient.supplier_id!);
                }
            }
        }
    }

    updatePOItemField(itemId: string, field: 'quantity' | 'cost' | 'lot_number' | 'expiration_date', value: any) {
        this.poItems.update(items => items.map(item => 
            item.id === itemId ? { ...item, [field]: value } : item
        ));
    }

    removePOItem(itemId: string) {
        this.poItems.update(items => items.filter(item => item.id !== itemId));
    }

    async savePurchaseOrder() {
        const formValue = this.poForm();
        const items = this.poItems();
        // AUDIT: Get current employee
        const employeeId = this.activeEmployee()?.id;
        
        if (items.length === 0) {
            await this.notificationService.alert('Adicione pelo menos um item à ordem de compra.');
            return;
        }

        this.isSavingPO.set(true);
        // AUDIT: Pass employeeId
        const result = await this.purchasingDataService.createPurchaseOrder(formValue, items, employeeId || null);
        
        if (result.success) {
          this.notificationService.show('Ordem de Compra criada com sucesso!', 'success');
          this.closePurchaseOrderModal();
          this.stockPrediction.set(null); // Clear prediction after creating order
        } else {
          await this.notificationService.alert(`Falha ao salvar. Erro: ${result.error?.message}`);
        }
        this.isSavingPO.set(false);
    }
    
    // --- On-the-fly Ingredient Creation ---
    openAddIngredientModal() {
        this.poItemSearchTerm.set(''); // Close search popover
        this.newIngredientForm.set({ ...EMPTY_INGREDIENT });
        this.isAddingIngredient.set(true);
    }
    
    closeAddIngredientModal() {
        this.isAddingIngredient.set(false);
    }

    updateNewIngredientField(field: keyof Omit<Ingredient, 'id' | 'created_at' | 'user_id' | 'ingredient_categories' | 'suppliers'>, value: any) {
        this.newIngredientForm.update(form => {
            const newForm: Partial<Ingredient> = { ...form };
            switch (field) {
                case 'stock':
                case 'cost':
                case 'min_stock':
                case 'standard_portion_weight_g': {
                    const numValue = parseFloat(value);
                    (newForm as any)[field] = isNaN(numValue) ? (field === 'standard_portion_weight_g' ? null : 0) : numValue;
                    break;
                }
                case 'price': {
                    const numValue = parseFloat(value);
                    newForm.price = isNaN(numValue) ? null : numValue;
                    break;
                }
                case 'is_sellable':
                case 'is_portionable':
                case 'is_yield_product':
                    (newForm as any)[field] = value as boolean;
                    break;
                case 'name':
                    newForm.name = value;
                    break;
                case 'unit':
                    newForm.unit = value as IngredientUnit;
                    break;
                case 'category_id':
                case 'supplier_id':
                case 'pos_category_id':
                case 'station_id':
                case 'proxy_recipe_id':
                case 'external_code':
                case 'expiration_date':
                case 'last_movement_at':
                    (newForm as any)[field] = (value === 'null' || value === '') ? null : value;
                    break;
                default:
                    break;
            }
            return newForm;
        });
    }

    async saveNewIngredient() {
        const form = this.newIngredientForm();
        if (!form.name?.trim()) {
            await this.notificationService.alert('O nome do ingrediente é obrigatório.');
            return;
        }
        const { success, error, data: newIngredient } = await this.inventoryDataService.addIngredient(form);
        if (success && newIngredient) {
            if (this.isPurchaseOrderModalOpen()) {
                await this.addPOItemToOrder(newIngredient as Ingredient);
            }
            this.closeAddIngredientModal();
        } else {
            await this.notificationService.alert(`Erro: ${error?.message}`);
        }
    }
}
