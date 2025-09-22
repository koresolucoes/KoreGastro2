import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Hall } from '../../../models/db.models';
import { PosStateService } from '../../../services/pos-state.service';
import { PosDataService } from '../../../services/pos-data.service';
import { output, OutputEmitterRef } from '@angular/core';

@Component({
  selector: 'app-hall-manager-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hall-manager-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HallManagerModalComponent {
  posState = inject(PosStateService);
  posDataService = inject(PosDataService);

  closeModal: OutputEmitterRef<void> = output<void>();

  halls = this.posState.halls;
  newHallName = signal('');
  editingHall = signal<Hall | null>(null);
  hallPendingDeletion = signal<Hall | null>(null);

  async addHall() {
    const name = this.newHallName().trim();
    if (!name) return;
    const { success, error } = await this.posDataService.addHall(name);
    if (success) this.newHallName.set('');
    else alert(`Falha ao adicionar salão. Erro: ${error?.message}`);
  }

  startEditing(hall: Hall) {
    this.editingHall.set({ ...hall });
    this.hallPendingDeletion.set(null);
  }
  cancelEditing() {
    this.editingHall.set(null);
  }

  updateEditingHallName(event: Event) {
    const newName = (event.target as HTMLInputElement).value;
    this.editingHall.update(h => h ? { ...h, name: newName } : h);
  }

  async saveHall() {
    const hall = this.editingHall();
    if (!hall || !hall.name.trim()) return;
    const { success, error } = await this.posDataService.updateHall(hall.id, hall.name.trim());
    if (success) this.cancelEditing();
    else alert(`Falha ao salvar. Erro: ${error?.message}`);
  }

  requestDelete(hall: Hall) {
    this.hallPendingDeletion.set(hall);
    this.editingHall.set(null);
  }
  cancelDelete() {
    this.hallPendingDeletion.set(null);
  }

  async confirmDelete() {
    const hall = this.hallPendingDeletion();
    if (hall) {
      await this.posDataService.deleteTablesByHallId(hall.id);
      await this.posDataService.deleteHall(hall.id);
      this.hallPendingDeletion.set(null);
    }
  }
}