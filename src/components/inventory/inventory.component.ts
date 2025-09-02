import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Ingredient, IngredientUnit, IngredientCategory, Supplier } from '../../models/db.models';

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

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
    dataService = inject(SupabaseService);
    ingredients = this.dataService.ingredients;
    categories = this.dataService.ingredientCategories;
    suppliers = this.dataService.suppliers;
    
    // CRUD Modal and Form management
    isModalOpen = signal(false);
    editingIngredient = signal<Partial<Ingredient> | null>(null);
    ingredientForm = signal<Partial<Ingredient>>(EMPTY_INGREDIENT);
    
    // Adjustment Modal
    isAdjustmentModalOpen = signal(false);
    adjustmentIngredient = signal<Ingredient | null>(null);
    adjustmentQuantity = signal(0);
    adjustmentType = signal<'entry' | 'exit'>('entry');
    adjustmentReason = signal('');
    adjustmentCustomReason = signal('');
    adjustmentSupplierId = signal<string | null>(null);

    // Deletion management
    ingredientPendingDeletion = signal<Ingredient | null>(null);

    // Filter states
    activeDashboardFilter = signal<DashboardFilter>('all');
    activeCategoryFilter = signal<string | null>(null);
    searchTerm = signal('');

    availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];
    entryReasons = ['Compra de Fornecedor', 'Devolução', 'Correção de Contagem', 'Outro'];
    exitReasons = ['Perda / Quebra', 'Vencimento', 'Consumo Interno', 'Outro'];

    // Dashboard computed values
    totalInventoryCost = computed(() => {
        return this.ingredients().reduce((sum, item) => sum + (item.stock * item.cost), 0);
    });
    lowStockCount = computed(() => this.ingredients().filter(i => this.isLowStock(i.stock, i.min_stock)).length);
    expiringSoonCount = computed(() => this.ingredients().filter(i => this.isExpiringSoon(i.expiration_date)).length);
    stagnantStockCount = computed(() => this.ingredients().filter(i => this.isStagnant(i.last_movement_at)).length);


    // Filtering logic
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
            case 'low_stock':
                filteredByDashboard = ingredients.filter(i => this.isLowStock(i.stock, i.min_stock));
                break;
            case 'expiring_soon':
                filteredByDashboard = ingredients.filter(i => this.isExpiringSoon(i.expiration_date));
                break;
            case 'stagnant':
                filteredByDashboard = ingredients.filter(i => this.isStagnant(i.last_movement_at));
                break;
            case 'all':
            default:
                filteredByDashboard = ingredients;
        }
        
        if (!term) {
            return filteredByDashboard;
        }

        return filteredByDashboard.filter(i => i.name.toLowerCase().includes(term));
    });
    
    stockAfterAdjustment = computed(() => {
        const ingredient = this.adjustmentIngredient();
        if (!ingredient) return 0;
        const change = this.adjustmentType() === 'entry' ? this.adjustmentQuantity() : -this.adjustmentQuantity();
        return ingredient.stock + change;
    });

    setDashboardFilter(filter: DashboardFilter) {
        this.activeDashboardFilter.set(filter);
    }

    setCategoryFilter(categoryId: string | null) {
        this.activeCategoryFilter.set(categoryId);
    }

    isLowStock(stock: number, minStock: number): boolean {
        return stock < minStock;
    }

    isExpiringSoon(expirationDate?: string | null): boolean {
        if (!expirationDate) return false;
        const today = new Date();
        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(today.getDate() + 7);
        const expDate = new Date(expirationDate);
        return expDate <= sevenDaysFromNow && expDate >= today;
    }

    isStagnant(lastMovementDate?: string | null): boolean {
        if (!lastMovementDate) return true; // Never moved
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return new Date(lastMovementDate) < thirtyDaysAgo;
    }

    // --- CRUD Modal ---
    openAddModal() {
        this.ingredientForm.set({ 
            ...EMPTY_INGREDIENT, 
            category_id: this.categories()[0]?.id ?? null,
            supplier_id: this.suppliers()[0]?.id ?? null,
        });
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
            if (field === 'category_id' || field === 'supplier_id') {
                newForm[field] = value === 'null' ? null : value;
            } else if (field === 'name' || field === 'unit' || field === 'expiration_date' || field === 'last_movement_at') {
                newForm[field] = value as any;
            // FIX: Use 'else if' to specifically target numeric fields and avoid incorrect type assignments.
            } else if (field === 'stock' || field === 'cost' || field === 'min_stock') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    newForm[field] = numValue;
                }
            }
            return newForm;
        });
    }

    async saveIngredient() {
        const formValue = this.ingredientForm();
        if (!formValue.name || formValue.name.trim() === '') {
            alert('O nome do ingrediente é obrigatório.');
            return;
        }

        let result;
        const { ingredient_categories, suppliers, ...dbFormValue } = formValue; // Remove joined data before sending

        if (this.editingIngredient() && this.editingIngredient()!.id) {
            const ingredientToUpdate = { ...dbFormValue, id: this.editingIngredient()!.id! };
            result = await this.dataService.updateIngredient(ingredientToUpdate);
        } else {
            const { id, created_at, ...newIngredientData } = dbFormValue;
            result = await this.dataService.addIngredient(newIngredientData as Omit<Ingredient, 'id' | 'created_at'>);
        }

        if (result.success) {
            this.closeModal();
        } else {
            alert(`Falha ao salvar o ingrediente. Erro: ${result.error?.message}`);
        }
    }

    // --- Adjustment Modal ---
    openAdjustmentModal(ingredient: Ingredient) {
        this.adjustmentIngredient.set(ingredient);
        this.adjustmentQuantity.set(0);
        this.adjustmentType.set('entry');
        this.adjustmentReason.set(this.entryReasons[0]);
        this.adjustmentCustomReason.set('');
        this.adjustmentSupplierId.set(null);
        this.isAdjustmentModalOpen.set(true);
    }

    closeAdjustmentModal() {
        this.isAdjustmentModalOpen.set(false);
    }
    
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
            alert('A quantidade do ajuste deve ser maior que zero.');
            return;
        }

        if (this.adjustmentType() === 'exit' && quantity > ingredient.stock) {
            alert('A quantidade de saída não pode ser maior que o estoque atual.');
            return;
        }

        let finalReason = this.adjustmentReason();
        if (finalReason === 'Outro') {
            finalReason = this.adjustmentCustomReason().trim();
            if (!finalReason) {
                alert('Por favor, especifique o motivo do ajuste.');
                return;
            }
        } else if (finalReason === 'Compra de Fornecedor') {
            const supplierId = this.adjustmentSupplierId();
            if (supplierId) {
                const supplierName = this.suppliers().find(s => s.id === supplierId)?.name;
                if (supplierName) {
                    finalReason = `${finalReason} - ${supplierName}`;
                }
            }
        }
        
        const quantityChange = this.adjustmentType() === 'entry' ? quantity : -quantity;

        const result = await this.dataService.adjustIngredientStock(ingredient.id, quantityChange, finalReason);
        if (result.success) {
            this.closeAdjustmentModal();
        } else {
            alert(`Falha ao ajustar o estoque. Erro: ${result.error?.message}`);
        }
    }


    // --- Deletion ---
    requestDeleteIngredient(ingredient: Ingredient) {
        this.ingredientPendingDeletion.set(ingredient);
    }

    cancelDeleteIngredient() {
        this.ingredientPendingDeletion.set(null);
    }
    
    async confirmDeleteIngredient() {
        const ingredientToDelete = this.ingredientPendingDeletion();
        if (ingredientToDelete) {
            const result = await this.dataService.deleteIngredient(ingredientToDelete.id);
            if (!result.success) {
                alert(`Falha ao deletar o ingrediente. Erro: ${result.error?.message}`);
            }
            this.ingredientPendingDeletion.set(null);
        }
    }
}