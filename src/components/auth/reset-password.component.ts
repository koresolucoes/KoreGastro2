
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';

type ResetState = 'idle' | 'loading' | 'error' | 'success';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  authService = inject(AuthService);
  router = inject(Router);
  notificationService = inject(NotificationService);

  newPassword = signal('');
  confirmPassword = signal('');
  resetState = signal<ResetState>('idle');
  errorMessage = signal('');

  async handlePasswordReset() {
    if (!this.newPassword() || !this.confirmPassword()) {
      this.errorMessage.set('Por favor, preencha ambos os campos.');
      this.resetState.set('error');
      return;
    }

    if (this.newPassword() !== this.confirmPassword()) {
      this.errorMessage.set('As senhas não coincidem.');
      this.resetState.set('error');
      return;
    }
    
    if (this.newPassword().length < 6) {
        this.errorMessage.set('A senha deve ter pelo menos 6 caracteres.');
        this.resetState.set('error');
        return;
    }

    this.resetState.set('loading');
    this.errorMessage.set('');

    const { error } = await this.authService.updateUserPassword(this.newPassword());
    
    if (error) {
        this.errorMessage.set(error.message);
        this.resetState.set('error');
    } else {
        this.resetState.set('success');
        await this.notificationService.alert('Sua senha foi redefinida com sucesso! Você será redirecionado para a tela de login.', 'Sucesso');
        await this.authService.signOut(); // Log out from the recovery session
        this.router.navigate(['/login']);
    }
  }
}
