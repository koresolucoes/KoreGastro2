import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Ingredient, IngredientCategory } from '../../../models/db.models';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { NotificationService } from '../../../services/notification.service';

interface CountedIngredient extends Ingredient {
  counted_stock: number | null;
  difference: number;
}

@Component({
  selector: 'app-inventory-audit',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './inventory-audit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryAuditComponent {
  private inventoryState = inject(InventoryStateService);
  private inventoryDataService = inject(InventoryDataService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // Data signals
  ingredients = this.inventoryState.ingredients;
  categories = this.inventoryState.ingredientCategories;

  // State signals
  counts = signal<Map<string, number>>(new Map());
  activeCategoryFilter = signal<string | null>(null);
  searchTerm = signal('');
  isFinalizing = signal(false);

  // Computed properties
  ingredientsWithCount = computed<CountedIngredient[]>(() => {
    return this.ingredients().map(ing => {
      const counted_stock = this.counts().get(ing.id) ?? null;
      const difference = counted_stock !== null ? counted_stock - ing.stock : 0;
      return { ...ing, counted_stock, difference };
    });
  });

  filteredIngredients = computed(() => {
    const categoryFilter = this.activeCategoryFilter();
    const term = this.searchTerm().toLowerCase();
    let ingredients = this.ingredientsWithCount();

    if (categoryFilter) {
      ingredients = ingredients.filter(i => i.category_id === categoryFilter);
    }
    
    if (term) {
      return ingredients.filter(i => i.name.toLowerCase().includes(term));
    }
    
    return ingredients;
  });

  summary = computed(() => {
    const allItems = this.ingredientsWithCount();
    const countedItems = allItems.filter(item => item.counted_stock !== null);
    
    const totalDifferenceValue = countedItems.reduce((sum, item) => {
      return sum + (item.difference * item.cost);
    }, 0);

    return {
      itemsCounted: countedItems.length,
      totalItems: allItems.length,
      totalDifferenceValue: totalDifferenceValue,
    };
  });
  
  hasCountedItems = computed(() => this.counts().size > 0);

  // Methods
  setCategoryFilter(categoryId: string | null) {
    this.activeCategoryFilter.set(categoryId);
  }

  updateCount(ingredientId: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const newCount = value === '' ? null : parseFloat(value);
    
    this.counts.update(currentCounts => {
      const newMap = new Map(currentCounts);
      if (newCount === null) {
        newMap.delete(ingredientId);
      } else {
        newMap.set(ingredientId, newCount);
      }
      return newMap;
    });
  }
  
  focusNext(event: KeyboardEvent, nextElementId: string) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const nextElement = document.getElementById(nextElementId);
        if (nextElement) {
            nextElement.focus();
            (nextElement as HTMLInputElement).select();
        }
    }
  }

  async finalizeAndAdjust() {
    const adjustments = this.ingredientsWithCount()
      .filter(item => item.difference !== 0)
      .map(item => ({
        ingredientId: item.id,
        quantityChange: item.difference,
        reason: `Ajuste de Inventário - Contagem de ${new Date().toLocaleDateString('pt-BR')}`
      }));
      
    if (adjustments.length === 0) {
      await this.notificationService.alert('Nenhum ajuste necessário. Nenhum item foi alterado.', 'Contagem de Estoque');
      return;
    }

    const summary = this.summary();
    const valueChangeText = summary.totalDifferenceValue > 0 
      ? `um ganho de ${summary.totalDifferenceValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
      : `uma perda de ${Math.abs(summary.totalDifferenceValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

    const confirmed = await this.notificationService.confirm(
      `Você está prestes a ajustar o estoque de ${adjustments.length} item(ns), resultando em ${valueChangeText}. Esta ação é irreversível. Deseja continuar?`,
      'Finalizar Contagem de Estoque'
    );

    if (confirmed) {
      this.isFinalizing.set(true);
      try {
        const promises = adjustments.map(adj => this.inventoryDataService.adjustIngredientStock(adj));
        const results = await Promise.all(promises);
        
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
          await this.notificationService.alert(`Houve falha ao ajustar ${failures.length} item(ns). Verifique o estoque e tente novamente.`, 'Erro');
        } else {
          await this.notificationService.alert('Estoque ajustado com sucesso!', 'Sucesso');
          this.router.navigate(['/inventory']);
        }
      } catch (error) {
        await this.notificationService.alert(`Ocorreu um erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      } finally {
        this.isFinalizing.set(false);
      }
    }
  }
}