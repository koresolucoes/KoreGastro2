import { Component, ChangeDetectionStrategy, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ingredient, IngredientUnit } from '../../../models/db.models';
import { SupabaseStateService } from '../../../services/supabase-state.service';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-ingredient-form-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ingredient-form-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientFormModalComponent {
  private stateService = inject(SupabaseStateService);
  private inventoryDataService = inject(InventoryDataService);
  private notificationService = inject(NotificationService);

  close = output<Ingredient | null>();

  ingredientForm = signal<Partial<Ingredient>>({
    name: '',
    unit: 'un',
    cost: 0,
    min_stock: 0,
    stock: 0,
    category_id: this.stateService.ingredientCategories()[0]?.id || null,
  });
  
  isAddingCategory = signal(false);
  newCategoryName = signal('');
  
  categories = this.stateService.ingredientCategories;
  availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];

  updateFormValue(field: keyof Omit<Ingredient, 'id' | 'created_at'>, value: any) {
    if (field === 'category_id' && value === 'add_new') {
      this.isAddingCategory.set(true);
      return;
    }
    this.ingredientForm.update(form => ({ ...form, [field]: value }));
  }

  async saveNewCategory() {
    const name = this.newCategoryName().trim();
    if (!name) { this.isAddingCategory.set(false); return; }
    
    const { success, error, data } = await this.inventoryDataService.addIngredientCategory(name);
    if (success && data) {
      this.updateFormValue('category_id', data.id);
    } else {
       await this.notificationService.alert(`Erro: ${error?.message}`);
    }
    this.isAddingCategory.set(false);
    this.newCategoryName.set('');
  }
  
  async saveIngredient() {
    const formValue = this.ingredientForm();
    if (!formValue.name?.trim()) {
      await this.notificationService.alert('O nome do ingrediente é obrigatório.');
      return;
    }

    const { success, error, data } = await this.inventoryDataService.addIngredient(formValue);
    if (success && data) {
      this.close.emit(data);
    } else {
      await this.notificationService.alert(`Falha ao salvar ingrediente. Erro: ${error?.message}`);
    }
  }
}
