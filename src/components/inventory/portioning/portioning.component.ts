import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { HrStateService } from '../../../services/hr-state.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';
import { NotificationService } from '../../../services/notification.service';
import { PortioningDataService, PortioningForm } from '../../../services/portioning-data.service';
import { PortioningEvent, PortioningEventOutput, Ingredient, InventoryLot, PortioningOutputType } from '../../../models/db.models';

@Component({
  selector: 'app-portioning',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './portioning.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortioningComponent {
  inventoryState = inject(InventoryStateService);
  hrState = inject(HrStateService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);
  portioningDataService = inject(PortioningDataService);

  portioningEvents = this.inventoryState.portioningEvents;
  employees = this.hrState.employees;
  
  isModalOpen = signal(false);
  isSaving = signal(false);

  // Form state
  form = signal<Partial<PortioningForm>>({});
  
  portionableIngredients = computed(() => this.inventoryState.ingredients().filter(i => i.is_portionable));
  yieldIngredients = computed(() => this.inventoryState.ingredients().filter(i => i.is_yield_product));
  
  availableLots = computed(() => {
    const inputId = this.form().input_ingredient_id;
    if (!inputId) return [];
    return this.inventoryState.inventoryLots().filter(l => l.ingredient_id === inputId && l.quantity > 0);
  });

  openAddModal() {
    this.form.set({
      employee_id: this.operationalAuthService.activeEmployee()?.id,
      notes: '',
      outputs: [{
        output_type: 'YIELD',
        description: 'Rendimento Principal',
        quantity_produced: 0,
        unit: 'un'
      }]
    });
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  addOutput(type: 'BYPRODUCT' | 'WASTE') {
    this.form.update(f => ({
      ...f,
      outputs: [
        ...(f.outputs || []),
        { output_type: type, description: '', quantity_produced: 0, unit: type === 'WASTE' ? 'g' : 'un' }
      ]
    }));
  }

  removeOutput(index: number) {
    this.form.update(f => ({
      ...f,
      outputs: (f.outputs || []).filter((_, i) => i !== index)
    }));
  }

  onInputIngredientChange(ingredientId: string | undefined) {
    this.form.update(f => ({
      ...f,
      input_ingredient_id: ingredientId,
      input_lot_id: undefined // Reset lot when ingredient changes
    }));
  }

  updateFormValue(field: keyof Omit<PortioningForm, 'outputs' | 'input_ingredient_id'>, value: any) {
    this.form.update(f => ({
      ...f,
      [field]: value
    }));
  }

  updateOutputField(index: number, field: keyof PortioningEventOutput, value: any) {
    this.form.update(f => {
        const newOutputs = [...(f.outputs || [])];
        if (newOutputs[index]) {
            (newOutputs[index] as any)[field] = value;
        }
        return { ...f, outputs: newOutputs };
    });
  }

  async saveEvent() {
    const formValue = this.form();
    if (!formValue.input_ingredient_id || !formValue.input_lot_id || !formValue.input_quantity) {
      this.notificationService.show('Por favor, preencha o insumo de entrada, lote e quantidade.', 'warning');
      return;
    }
    // More validation needed here in a real app
    this.isSaving.set(true);
    const result = await this.portioningDataService.createPortioningEvent(formValue as PortioningForm);
    if (result.success) {
      this.notificationService.show('Evento de porcionamento registrado com sucesso!', 'success');
      this.closeModal();
    } else {
      this.notificationService.show(`Erro: ${(result.error as any)?.message || 'Erro desconhecido'}`, 'error');
    }
    this.isSaving.set(false);
  }
}
