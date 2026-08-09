
import { Component, ChangeDetectionStrategy, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HrStateService } from '../../../services/hr-state.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';
import { UnitContextService } from '../../../services/unit-context.service';
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
  private operationalAuth = inject(OperationalAuthService);
  private unitContextService = inject(UnitContextService);

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

  
  private async verifyPin() {
    const enteredPin = this.pin();
    const storeId = this.unitContextService.activeStoreId();
    if (!storeId) {
        this.showError();
        return;
    }

    const { success, employee } = await this.operationalAuth.verifyManagerPin(enteredPin, storeId);

    if (success && employee) {
      this.authorized.emit(employee);
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
