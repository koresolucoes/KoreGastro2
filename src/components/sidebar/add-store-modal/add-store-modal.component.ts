
import { Component, ChangeDetectionStrategy, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-add-store-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './add-store-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddStoreModalComponent {
  authService = inject(AuthService);
  closeModal = output<void>();

  currentUserEmail = this.authService.currentUser()?.email || '';

  copyEmail() {
    navigator.clipboard.writeText(this.currentUserEmail);
  }
}
