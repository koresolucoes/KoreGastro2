
import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
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
export class ResetPasswordComponent implements OnInit {
  authService = inject(AuthService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  router: Router = inject(Router);
  notificationService = inject(NotificationService);

  newPassword = signal('');
  confirmPassword = signal('');
  resetState = signal<ResetState>('idle');
  errorMessage = signal('');
  isSessionValid = signal(true); // Controla se a sessão do token é válida

  ngOnInit() {
    // O cliente Supabase precisa de um momento para processar o fragmento da URL.
    // Verificamos após um breve atraso.
    setTimeout(() => {
      if (!this.authService.currentUser()) {
        this.errorMessage.set('Token de redefinição inválido ou expirado. Por favor, solicite um novo link.');
        this.resetState.set('error');
        this.isSessionValid.set(false); // Desativa o formulário
      }
    }, 500); // 500ms deve ser suficiente para o Supabase inicializar a sessão
  }

  async handlePasswordReset() {
    if (!this.isSessionValid()) {
      return;
    }

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
        this.errorMessage.set('Sessão expirada ou inválida. Por favor, solicite um novo link de redefinição.');
        this.resetState.set('error');
        this.isSessionValid.set(false);
    } else {
        this.resetState.set('success');
        await this.notificationService.alert('Sua senha foi redefinida com sucesso! Você será redirecionado para a seleção de operador.', 'Sucesso');
        // O usuário agora está autenticado com uma sessão válida, redirecione-o para dentro do app.
        this.router.navigate(['/employee-selection']);
    }
  }
}