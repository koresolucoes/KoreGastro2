

import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { ThemeService } from '../../services/theme.service';
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
  operationalAuth = inject(OperationalAuthService);
  themeService = inject(ThemeService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  router: Router = inject(Router);
  notificationService = inject(NotificationService);

  email = signal('');
  password = signal('');
  authState = signal<AuthState>('idle');
  errorMessage = signal('');

  passwordStrength = computed(() => {
    const p = this.password();
    if (!p) return 0;
    let strength = 0;
    if (p.length >= 6) strength += 25;
    if (p.length >= 8) strength += 25;
    if (/[A-Z]/.test(p)) strength += 25;
    if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) strength += 25;
    return strength;
  });

  passwordStrengthLabel = computed(() => {
    const s = this.passwordStrength();
    if (s === 0) return '';
    if (s <= 25) return 'Fraca';
    if (s <= 50) return 'Razoável';
    if (s <= 75) return 'Boa';
    return 'Forte';
  });

  passwordStrengthColor = computed(() => {
    const s = this.passwordStrength();
    if (s <= 25) return 'bg-red-500';
    if (s <= 50) return 'bg-yellow-500';
    if (s <= 75) return 'bg-blue-500';
    return 'bg-green-500';
  });

  toggleTheme() {
    this.themeService.toggleTheme();
  }

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
      
      // Force clearing of any previously selected employee so the user must select one again
      this.operationalAuth.resetSession();
      
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