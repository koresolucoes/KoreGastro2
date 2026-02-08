
import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output, InputSignal, OutputEmitterRef, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ingredient, Recipe, LabelType } from '../../../models/db.models';
import { LabelPrintingService, LabelData } from '../../../services/label-printing.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';
import { InventoryDataService } from '../../../services/inventory-data.service';

@Component({
  selector: 'app-label-generator-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './label-generator-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class LabelGeneratorModalComponent implements OnInit {
  // Inputs: Can be Ingredient or Recipe. 
  item: InputSignal<Ingredient | Recipe | null> = input.required<Ingredient | Recipe | null>();
  // Source type: 'INVENTORY' or 'RECIPE'
  sourceType: InputSignal<'INVENTORY' | 'RECIPE'> = input.required<'INVENTORY' | 'RECIPE'>();
  
  close: OutputEmitterRef<void> = output<void>();

  private labelService = inject(LabelPrintingService);
  private authService = inject(OperationalAuthService);
  private inventoryDataService = inject(InventoryDataService);

  // Form State
  form = signal<{
    type: LabelType;
    customName: string;
    manipulationDate: string; // ISO for input
    expirationDate: string; // ISO for input
    quantity: number | null;
    unit: string;
    lotNumber: string;
    storageConditions: string;
  }>({
    type: 'OPENING',
    customName: '',
    manipulationDate: new Date().toISOString().slice(0, 16),
    expirationDate: '',
    quantity: null,
    unit: 'un',
    lotNumber: '',
    storageConditions: ''
  });

  printFormat = signal<'standard' | 'compact'>('standard');
  copies = signal(1);

  itemName = computed(() => this.item()?.name || this.form().customName || 'Item Avulso');
  responsibleName = computed(() => this.authService.activeEmployee()?.name || 'Usuário');

  // Preview Helpers
  dayColor = computed(() => {
      const date = new Date(this.form().expirationDate);
      return isNaN(date.getTime()) ? '#ccc' : this.labelService.getDayColor(date);
  });
  
  dayName = computed(() => {
      const date = new Date(this.form().expirationDate);
      return isNaN(date.getTime()) ? '---' : this.labelService.getDayName(date);
  });

  ngOnInit() {
    this.initializeForm();
  }

  initializeForm() {
    const currentItem = this.item();
    const type = this.sourceType() === 'RECIPE' ? 'PREPARED' : 'OPENING';
    const now = new Date();
    
    // Default shelf life calculation
    let daysToAdd = 3;
    let storage = 'Refrigerado';
    let unit = 'un';

    if (currentItem) {
        if ('shelf_life_after_open_days' in currentItem) { // Ingredient
            daysToAdd = currentItem.shelf_life_after_open_days || 3;
            storage = currentItem.storage_conditions || 'Refrigerado';
            unit = currentItem.unit;
        } else if ('shelf_life_prepared_days' in currentItem) { // Recipe
             daysToAdd = currentItem.shelf_life_prepared_days || 2;
             storage = currentItem.storage_conditions || 'Refrigerado';
        }
    }

    const expDate = this.labelService.calculateExpiration(now, daysToAdd);

    this.form.set({
        type,
        customName: '',
        manipulationDate: now.toISOString().slice(0, 16),
        expirationDate: expDate.toISOString().slice(0, 16),
        quantity: null,
        unit,
        lotNumber: '',
        storageConditions: storage
    });
  }

  updateType(type: LabelType) {
    this.form.update(f => ({ ...f, type }));
    // Logic to adjust shelf life based on type could go here (e.g. Defrost = 3 days fixed)
  }

  updateField(field: string, value: any) {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  async print() {
      const f = this.form();
      const labelData: LabelData = {
          itemName: this.itemName(),
          manipulationDate: new Date(f.manipulationDate),
          expirationDate: new Date(f.expirationDate),
          responsibleName: this.responsibleName(),
          quantity: f.quantity || undefined,
          unit: f.unit,
          lotNumber: f.lotNumber,
          storageConditions: f.storageConditions,
          type: f.type
      };

      // 1. Print
      for(let i=0; i < this.copies(); i++) {
        this.labelService.printLabel(labelData, this.printFormat());
        // Small delay between print jobs if needed, usually browser handles queue
      }

      // 2. Log to DB (Fire and forget)
      this.inventoryDataService.logLabelCreation({
          item_name: labelData.itemName,
          quantity: labelData.quantity || 0,
          unit: labelData.unit,
          lot_number: labelData.lotNumber,
          manipulation_date: labelData.manipulationDate.toISOString(),
          expiration_date: labelData.expirationDate.toISOString(),
          label_type: labelData.type,
          employee_id: this.authService.activeEmployee()?.id
      });

      this.close.emit();
  }
}
