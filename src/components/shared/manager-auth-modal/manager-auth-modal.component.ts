
import { Component, ChangeDetectionStrategy, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HrStateService } from '../../../services/hr-state.service';
import { Employee } from '../../../models/db.models';

@Component({
  selector: 'app-manager-auth-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manager-auth-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerAuthModalComponent {
  private hrState = inject(HrStateService);

  authorized = output<Employee>();
  close = output<void>();

  pin = signal('');
  hasError = signal(false);
  pinDisplay = computed(() => '●'.repeat(this.pin().length));

  handleInput(digit: string) {
    if (this.pin().length < 4) {
      this.pin.update(p => p + digit);
      if (this.pin().length === 4) {
        this.verifyPin();
      }
    }
  }

  deleteDigit() {
    this.pin.update(p => p.slice(0, -1));
    this.hasError.set(false);
  }

  clear() {
    this.pin.set('');
    this.hasError.set(false);
  }

  private verifyPin() {
    const enteredPin = this.pin();
    const employees = this.hrState.employees();
    const roles = this.hrState.roles();
    
    const managerRole = roles.find(r => r.name === 'Gerente');
    
    if (!managerRole) {
        // Fallback: Check if any employee has this PIN and is designated as manager in some other way, or fail safe.
        // For strictness, if no manager role exists, auth fails.
        this.showError();
        return;
    }

    const manager = employees.find(e => e.pin === enteredPin && e.role_id === managerRole.id);

    if (manager) {
      this.authorized.emit(manager);
    } else {
      this.showError();
    }
  }

  private showError() {
    this.hasError.set(true);
    setTimeout(() => {
      this.clear();
    }, 500);
  }
}
