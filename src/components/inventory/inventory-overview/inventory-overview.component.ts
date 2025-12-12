
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Ingredient, IngredientCategory, Supplier, IngredientUnit, Category, Station, InventoryLot } from '../../../models/db.models';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { NotificationService } from '../../../services/notification.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { PosStateService } from '../../../services/pos-state.service';
import { IngredientDetailsModalComponent } from '../ingredient-details-modal/ingredient-details-modal.component';

@Component({
  selector: 'app-inventory-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, IngredientDetailsModalComponent],
  templateUrl: './inventory-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryOverviewComponent {
  inventoryState = inject(InventoryStateService);
  inventoryDataService = inject(InventoryDataService);
  notificationService = inject(NotificationService);
  recipeState = inject(RecipeStateService);
  posState = inject(PosStateService);
  router = inject(Router);

  // Data
  ingredients = this.inventoryState.ingredients;
  categories = this.inventoryState.ingredientCategories;
  suppliers = this.inventoryState.suppliers;
  posCategories = this.recipeState.categories;
  stations = this.posState.stations;
  inventoryLots = this.inventoryState.inventoryLots;

  // View state
  searchTerm = signal('');
  activeCategoryFilter = signal<string | null>(null);

  // Modal state
  isModalOpen = signal(false);
  editingIngredient = signal<Partial<Ingredient> | null>(null);
  ingredientForm = signal<Partial<Ingredient>>({});
  ingredientPendingDeletion = signal<Ingredient | null>(null);
  
  // Details Modal
  isDetailsModalOpen = signal(false);
  selectedIngredientForDetails = signal<Ingredient | null>(null);
  lotsForSelectedIngredient = signal<InventoryLot[]>([]);

  availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];

  filteredIngredients = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const category = this.activeCategoryFilter();
    let ingredients = this.ingredients();

    if (category) {
      ingredients = ingredients.filter(i => i.category_id === category);
    }
    if (term) {
      ingredients = ingredients.filter(i => i.name.toLowerCase().includes(term));
    }

    return ingredients;
  });

  openAddModal() {
    this.editingIngredient.set(null);
    this.ingredientForm.set({ unit: 'un', cost: 0, stock: 0, min_stock: 0, is_sellable: false });
    this.isModalOpen.set(true);
  }

  openEditModal(ingredient: Ingredient) {
    this.editingIngredient.set(ingredient);
    this.ingredientForm.set({ ...ingredient });
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateIngredientFormField(field: keyof Omit<Ingredient, 'id' | 'created_at' | 'user_id' | 'ingredient_categories' | 'suppliers'>, value: any) {
    this.ingredientForm.update(form => {
      const newForm = { ...form };
      if (field === 'is_sellable') {
        (newForm as any)[field] = value;
        if (!value) { // if it becomes not sellable, clear related fields
          newForm.price = null;
          newForm.pos_category_id = null;
          newForm.station_id = null;
        }
      } else if (field === 'price' || field === 'cost' || field === 'stock' || field === 'min_stock' || field === 'standard_portion_weight_g') {
        (newForm as any)[field] = value !== '' ? parseFloat(value) : null;
      } else {
        (newForm as any)[field] = value === 'null' ? null : value;
      }
      return newForm;
    });
  }

  async saveIngredient() {
    const form = this.ingredientForm();
    if (!form.name?.trim()) {
      await this.notificationService.alert('O nome do ingrediente é obrigatório.');
      return;
    }

    let result;
    if (this.editingIngredient()) {
      result = await this.inventoryDataService.updateIngredient({ ...form, id: this.editingIngredient()!.id });
    } else {
      result = await this.inventoryDataService.addIngredient(form as any);
    }

    if (result.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha ao salvar. Erro: ${result.error?.message}`);
    }
  }

  requestDeleteIngredient(ingredient: Ingredient) {
    this.ingredientPendingDeletion.set(ingredient);
  }

  cancelDeleteIngredient() {
    this.ingredientPendingDeletion.set(null);
  }

  async confirmDeleteIngredient() {
    const ingredient = this.ingredientPendingDeletion();
    if (!ingredient) return;
    const { success, error } = await this.inventoryDataService.deleteIngredient(ingredient.id);
    if (!success) {
      await this.notificationService.alert(`Falha ao excluir ingrediente: ${error?.message}`);
    }
    this.ingredientPendingDeletion.set(null);
  }
  
  openDetailsModal(ingredient: Ingredient) {
    this.selectedIngredientForDetails.set(ingredient);
    this.lotsForSelectedIngredient.set(this.inventoryLots().filter(lot => lot.ingredient_id === ingredient.id));
    this.isDetailsModalOpen.set(true);
  }

  navigateToPurchasing() {
    const lowStockItems = this.ingredients().filter(i => i.stock < i.min_stock && i.min_stock > 0);
    if (lowStockItems.length > 0) {
        const itemsToOrder = lowStockItems.map(item => ({
            ingredientId: item.id,
            quantity: Math.max(1, item.min_stock - item.stock)
        }));
        this.router.navigate(['/purchasing'], { state: { newOrderItems: itemsToOrder } });
    } else {
        this.router.navigate(['/purchasing']);
    }
  }
}
