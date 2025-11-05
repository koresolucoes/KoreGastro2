import { Component, ChangeDetectionStrategy, inject, signal, output, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-assign-driver-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-driver-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignDriverModalComponent {
  closeModal: OutputEmitterRef<void> = output<void>();
  assignDriver: OutputEmitterRef<{ name: string; phone: string; vehicle: string; }> = output();

  driverForm = signal({
    name: '',
    phone: '',
    vehicle: 'MOTORCYCLE'
  });

  updateField(field: 'name' | 'phone' | 'vehicle', value: string) {
    this.driverForm.update(form => ({ ...form, [field]: value }));
  }

  onConfirm() {
    const form = this.driverForm();
    if (form.name.trim() && form.phone.trim()) {
      this.assignDriver.emit(form);
    }
  }
}
