
import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductionTask } from '../../../models/db.models';
import { MiseEnPlaceDataService } from '../../../services/mise-en-place-data.service';
import { LabelPrintingService } from '../../../services/label-printing.service';
import { NotificationService } from '../../../services/notification.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';

@Component({
  selector: 'app-mise-en-place-focus',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mise-en-place-focus.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class MiseEnPlaceFocusComponent implements OnInit, OnDestroy {
  // Inputs
  task = input.required<ProductionTask>();
  
  // Outputs
  close = output<void>();
  taskCompleted = output<void>();

  // Services
  private dataService = inject(MiseEnPlaceDataService);
  private labelService = inject(LabelPrintingService);
  private notificationService = inject(NotificationService);
  private authService = inject(OperationalAuthService);

  // State
  step = signal<'preview' | 'working' | 'finalize'>('preview');
  elapsedTime = signal(0);
  timerInterval: any;
  
  // Finalize Form
  producedQuantity = signal(0);
  notes = signal('');
  expirationDate = signal('');
  lotNumber = signal('');
  printLabel = signal(true);

  // Computed
  taskName = computed(() => this.task().recipes?.name || this.task().custom_task_name || 'Tarefa');
  targetQuantity = computed(() => this.task().quantity_to_produce);
  unit = computed(() => this.task().recipes?.unit || 'un');
  imageUrl = computed(() => this.task().recipes?.image_url);

  ngOnInit() {
    this.producedQuantity.set(this.targetQuantity());
    
    // Auto-generate lot
    const now = new Date();
    const lot = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    this.lotNumber.set(lot);

    // Calc expiration
    let daysToAdd = 3;
    if (this.task().recipes?.shelf_life_prepared_days) {
        daysToAdd = this.task().recipes?.shelf_life_prepared_days || 3;
    }
    const expDate = new Date(now);
    expDate.setDate(expDate.getDate() + daysToAdd);
    this.expirationDate.set(expDate.toISOString().split('T')[0]);

    // Check if already started
    if (this.task().status === 'Em Preparo') {
        this.step.set('working');
        if (this.task().started_at) {
            const start = new Date(this.task().started_at!).getTime();
            this.elapsedTime.set(Math.floor((Date.now() - start) / 1000));
        }
        this.startTimer();
    }
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
        this.elapsedTime.update(v => v + 1);
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }

  // Actions
  async startProduction() {
    // API Call to start task
    const { success } = await this.dataService.startTask(this.task().id);
    if (success) {
        this.step.set('working');
        this.startTimer();
    }
  }

  finishProduction() {
    this.stopTimer();
    this.step.set('finalize');
  }

  async confirmCompletion() {
    if (this.producedQuantity() <= 0) {
        this.notificationService.show('Quantidade inválida', 'warning');
        return;
    }

    const completionData = {
        quantityProduced: this.producedQuantity(),
        lotNumber: this.lotNumber(),
        expirationDate: this.expirationDate(),
        notes: this.notes(),
        printLabel: this.printLabel()
    };
    
    // Simple cost estimation (proportional)
    // Real app would calculate based on actual ingredients used if tracking batches
    const totalCost = 0; // Placeholder, service handles this better usually

    const { success, error } = await this.dataService.completeTask(this.task(), completionData, totalCost);

    if (success) {
        if (this.printLabel()) {
            this.labelService.printLabel({
                itemName: this.taskName(),
                manipulationDate: new Date(),
                expirationDate: new Date(this.expirationDate()),
                responsibleName: this.authService.activeEmployee()?.name || 'Chef',
                quantity: this.producedQuantity(),
                unit: this.unit(),
                lotNumber: this.lotNumber(),
                type: 'PREPARED'
            });
        }
        this.notificationService.show('Produção concluída!', 'success');
        this.taskCompleted.emit();
    } else {
        this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  cancel() {
      this.close.emit();
  }
}
