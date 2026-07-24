

import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';

type AuthState = 'idle' | 'loading' | 'error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  authService = inject(AuthService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  router: Router = inject(Router);
  notificationService = inject(NotificationService);

  email = signal('');
  password = signal('');
  authState = signal<AuthState>('idle');
  errorMessage = signal('');

  async handleLogin() {
    if (!this.email() || !this.password()) {
      this.errorMessage.set('Por favor, preencha o e-mail e a senha.');
      this.authState.set('error');
      return;
    }

    this.authState.set('loading');
    this.errorMessage.set('');

    try {
      const { error } = await this.authService.signInWithPassword(this.email(), this.password());
      if (error) {
        throw error;
      }
      // On successful login, auth service's onAuthStateChange will trigger.
      // We will now redirect to the intended URL or the default employee selection screen.
      const returnUrl = this.router.routerState.snapshot.root.queryParams['returnUrl'];
      if (returnUrl) {
        this.router.navigateByUrl(returnUrl);
      } else {
        this.router.navigate(['/employee-selection']);
      }
    } catch (error: any) {
      this.errorMessage.set('E-mail ou senha inválidos.');
      this.authState.set('error');
    }
  }

  async autoLoginAdmin() {
    this.email.set('admin@admin.com');
    this.password.set('admin123');
    
    this.authState.set('loading');
    this.errorMessage.set('');

    try {
      let { error } = await this.authService.signInWithPassword(this.email(), this.password());
      
      // If login fails (user doesn't exist or not confirmed), try to create/confirm via backend
      if (error) {
        const createRes = await fetch('/api/create-test-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email(), password: this.password() })
        });
        
        if (createRes.ok) {
          // Try to log in again after creation/confirmation
          const { error: retryError } = await this.authService.signInWithPassword(this.email(), this.password());
          if (retryError) throw retryError;
        } else {
          throw new Error('Falha ao criar usuário de teste no backend. Verifique as chaves do Supabase.');
        }
      }

      // Check if admin is authorized
      const returnUrl = this.router.routerState.snapshot.root.queryParams['returnUrl'] || '/admin/dashboard';
      this.router.navigateByUrl(returnUrl);
    } catch (error: any) {
      this.errorMessage.set('Erro no login de teste. Certifique-se de que o backend tem acesso ao SUPABASE_SERVICE_ROLE_KEY.');
      this.authState.set('error');
    }
  }

  async forgotPassword() {
    const { confirmed, value: email } = await this.notificationService.prompt(
      'Insira o e-mail da sua conta para enviarmos um link de recuperação de senha.',
      'Recuperar Senha',
      {
        inputType: 'text',
        placeholder: 'seu-email@dominio.com',
        confirmText: 'Enviar Link'
      }
    );

    if (confirmed && email) {
      this.authState.set('loading');
      this.errorMessage.set('');

      const { error } = await this.authService.sendPasswordResetEmail(email);
      this.authState.set('idle');

      if (error) {
        // This would be for things like being rate-limited, not for an invalid email.
        this.errorMessage.set('Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde.');
        this.authState.set('error');
      } else {
        await this.notificationService.alert(
          'Se uma conta com este e-mail existir, um link para redefinição de senha foi enviado. Verifique sua caixa de entrada e spam.',
          'E-mail Enviado'
        );
      }
    }
  }
}