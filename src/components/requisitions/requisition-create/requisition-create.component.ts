

import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PosStateService } from '../../../services/pos-state.service';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { RequisitionService } from '../../../services/requisition.service';
import { NotificationService } from '../../../services/notification.service';
import { Ingredient, RequisitionTemplate } from '../../../models/db.models';

interface RequestItem {
  ingredient: Ingredient;
  quantity: number;
}

@Component({
  selector: 'app-requisition-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './requisition-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionCreateComponent implements OnInit {
  posState = inject(PosStateService);
  inventoryState = inject(InventoryStateService);
  requisitionService = inject(RequisitionService);
  notificationService = inject(NotificationService);

  stations = this.posState.stations;
  ingredients = this.inventoryState.ingredients;
  templates = this.inventoryState.requisitionTemplates;
  
  selectedStationId = signal<string | null>(null);
  selectedTemplateId = signal<string | null>(null);

  searchTerm = signal('');
  cartItems = signal<RequestItem[]>([]);
  notes = signal('');
  isSubmitting = signal(false);

  ngOnInit() {
      // Load templates when component initializes
      this.requisitionService.loadTemplates();
  }

  filteredIngredients = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (term.length < 2) return [];
    
    // Filter out items already in cart
    const inCartIds = new Set(this.cartItems().map(i => i.ingredient.id));
    
    return this.ingredients()
      .filter(i => i.name.toLowerCase().includes(term) && !inCartIds.has(i.id))
      .slice(0, 10);
  });
  
  availableTemplates = computed(() => {
      const stationId = this.selectedStationId();
      if (!stationId) return [];
      // Show templates for this station OR global templates (null station_id)
      return this.templates().filter(t => t.station_id === stationId || t.station_id === null);
  });

  totalEstimatedCost = computed(() => {
      return this.cartItems().reduce((acc, item) => {
          return acc + (item.quantity * item.ingredient.cost);
      }, 0);
  });

  addItem(ingredient: Ingredient) {
    this.cartItems.update(items => [...items, { ingredient, quantity: 1 }]);
    this.searchTerm.set('');
  }

  removeItem(index: number) {
    this.cartItems.update(items => items.filter((_, i) => i !== index));
  }

  applyTemplate() {
      const templateId = this.selectedTemplateId();
      if (!templateId) return;

      const template = this.templates().find(t => t.id === templateId);
      if (!template || !template.template_items) return;

      const newItems: RequestItem[] = [];
      const allIngredients = this.ingredients();

      template.template_items.forEach(tmplItem => {
          const ingredient = allIngredients.find(i => i.id === tmplItem.ingredient_id);
          if (ingredient) {
              newItems.push({
                  ingredient: ingredient,
                  quantity: tmplItem.quantity
              });
          }
      });

      if (newItems.length > 0) {
          // Confirm overwrite if cart is not empty
          if (this.cartItems().length > 0) {
              if(!confirm('Isso irá substituir os itens atuais da lista. Continuar?')) {
                  return;
              }
          }
          this.cartItems.set(newItems);
          this.notificationService.show(`Template "${template.name}" aplicado!`, 'success');
      } else {
          this.notificationService.show('Este template não possui itens válidos.', 'warning');
      }
  }

  async saveAsTemplate() {
      const stationId = this.selectedStationId();
      if (!stationId) {
          this.notificationService.show('Selecione uma estação primeiro.', 'warning');
          return;
      }
      if (this.cartItems().length === 0) {
          this.notificationService.show('Adicione itens à lista primeiro.', 'warning');
          return;
      }

      const { confirmed, value: name } = await this.notificationService.prompt(
          'Nome do novo Kit/Template:',
          'Salvar Template',
          { placeholder: 'Ex: Kit Abertura Bar' }
      );

      if (confirmed && name) {
          const itemsPayload = this.cartItems().map(i => ({
              ingredientId: i.ingredient.id,
              quantity: i.quantity
          }));

          const { success, error } = await this.requisitionService.createTemplate(name, stationId, itemsPayload);
          if (success) {
              this.notificationService.show('Template salvo com sucesso!', 'success');
          } else {
              this.notificationService.show(`Erro ao salvar template: ${error?.message}`, 'error');
          }
      }
  }
  
  async deleteTemplate() {
       const templateId = this.selectedTemplateId();
       if (!templateId) return;
       const template = this.templates().find(t => t.id === templateId);
       
       const confirmed = await this.notificationService.confirm(`Deseja excluir o template "${template?.name}"?`);
       if (confirmed) {
           await this.requisitionService.deleteTemplate(templateId);
           this.selectedTemplateId.set(null);
           this.notificationService.show('Template excluído.', 'success');
       }
  }

  canSubmit = computed(() => !!this.selectedStationId() && this.cartItems().length > 0 && this.cartItems().every(i => i.quantity > 0));

  async submitRequisition() {
    if (!this.canSubmit()) return;
    
    this.isSubmitting.set(true);
    const payload = this.cartItems().map(i => ({
        ingredientId: i.ingredient.id,
        quantity: i.quantity,
        unit: i.ingredient.unit
    }));

    const { success, error } = await this.requisitionService.createRequisition(this.selectedStationId()!, payload, this.notes());

    if (success) {
        this.notificationService.show('Requisição enviada com sucesso!', 'success');
        this.cartItems.set([]);
        this.notes.set('');
        // Keep station selected for convenience
    } else {
        this.notificationService.show(`Erro ao enviar: ${error?.message}`, 'error');
    }
    this.isSubmitting.set(false);
  }
}
