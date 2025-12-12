
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';

import { Ingredient, PortioningOutputType } from '../../../models/db.models';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { NotificationService } from '../../../services/notification.service';

interface PortioningOutput {
  id: string;
  outputType: PortioningOutputType;
  ingredientId: string | null;
  description: string;
  totalWeight: number | null;
}

const EMPTY_OUTPUT: Omit<PortioningOutput, 'id'> = {
  outputType: 'YIELD',
  ingredientId: null,
  description: '',
  totalWeight: null,
};

@Component({
  selector: 'app-portioning',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './portioning.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortioningComponent {
  private inventoryState = inject(InventoryStateService);
  private inventoryDataService = inject(InventoryDataService);
  private notificationService = inject(NotificationService);

  isProcessing = signal(false);
  inputIngredientId = signal<string | null>(null);
  inputQuantity = signal<number | null>(null);
  notes = signal('');
  outputs = signal<PortioningOutput[]>([]);

  // --- Data Sources ---
  portionableIngredients = computed(() => 
    this.inventoryState.ingredients().filter(i => i.is_portionable)
  );

  yieldProducts = computed(() => 
    this.inventoryState.ingredients().filter(i => i.is_yield_product)
  );

  // --- Form Computeds ---
  inputIngredient = computed(() => {
    const id = this.inputIngredientId();
    if (!id) return null;
    return this.inventoryState.ingredients().find(i => i.id === id) ?? null;
  });

  totalInputCost = computed(() => {
    const ingredient = this.inputIngredient();
    const quantity = this.inputQuantity();
    if (!ingredient || !quantity) return 0;
    return ingredient.cost * quantity;
  });

  totalOutputWeight = computed(() => 
    this.outputs().reduce((sum, out) => sum + (out.totalWeight || 0), 0)
  );

  totalWasteWeight = computed(() => 
    this.outputs()
      .filter(o => o.outputType === 'WASTE')
      .reduce((sum, out) => sum + (out.totalWeight || 0), 0)
  );

  totalValidOutputWeight = computed(() => this.totalOutputWeight() - this.totalWasteWeight());

  yieldPercentage = computed(() => {
    const input = this.inputQuantity();
    const validOutput = this.totalValidOutputWeight();
    if (!input || input === 0) return 0;
    return (validOutput / input) * 100;
  });

  costPerKgPostPortioning = computed(() => {
    const totalCost = this.totalInputCost();
    const validWeight = this.totalValidOutputWeight();
    if (validWeight === 0) return 0;
    return totalCost / validWeight;
  });
  
  canSubmit = computed(() => {
    return !this.isProcessing() &&
           this.inputIngredientId() &&
           (this.inputQuantity() ?? 0) > 0 &&
           this.outputs().length > 0 &&
           this.outputs().every(o => o.totalWeight !== null && o.totalWeight > 0 && (o.ingredientId || o.outputType === 'WASTE'));
  });

  constructor() {
    this.addOutput(); // Start with one empty output row
  }

  addOutput(): void {
    this.outputs.update(outs => [...outs, { ...EMPTY_OUTPUT, id: uuidv4() }]);
  }

  removeOutput(id: string): void {
    this.outputs.update(outs => outs.filter(o => o.id !== id));
  }
  
  updateOutputType(id: string, newType: PortioningOutputType): void {
    this.outputs.update(outs => outs.map(o => {
      if (o.id === id) {
        const updated = { ...o, outputType: newType };
        // If changing to WASTE, clear ingredientId.
        if (newType === 'WASTE') {
          updated.ingredientId = null;
        }
        return updated;
      }
      return o;
    }));
  }

  async submitPortioning(): Promise<void> {
    if (!this.canSubmit()) {
      this.notificationService.show('Por favor, preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    this.isProcessing.set(true);

    const eventData = {
      inputIngredientId: this.inputIngredientId()!,
      inputQuantity: this.inputQuantity()!,
      notes: this.notes() || null,
    };

    const outputsData = this.outputs().map(o => ({
      output_type: o.outputType,
      ingredient_id: o.ingredientId,
      quantity: o.totalWeight!,
      unit: 'kg', // For now, assume all portioning is done in kg
      description: o.outputType === 'WASTE' ? o.description : null,
    }));

    try {
      const { success, error } = await this.inventoryDataService.createPortioningEvent(eventData, outputsData);

      if (!success) {
        throw error || new Error('Ocorreu um erro desconhecido ao salvar o porcionamento.');
      }

      this.notificationService.show('Porcionamento registrado com sucesso!', 'success');
      this.resetForm();
    } catch (error: any) {
      console.error('Error submitting portioning event:', error);
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isProcessing.set(false);
    }
  }

  private resetForm(): void {
    this.inputIngredientId.set(null);
    this.inputQuantity.set(null);
    this.notes.set('');
    this.outputs.set([]);
    this.addOutput(); // Add one fresh row
  }
}
