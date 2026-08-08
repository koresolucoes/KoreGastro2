

import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { ThemeService } from '../../services/theme.service';
import { PortalContextService, PortalType } from '../../services/portal-context.service';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { supabase } from '../../services/supabase-client';

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
  portalContext = inject(PortalContextService);
  router: Router = inject(Router);
  notificationService = inject(NotificationService);

  portalInfo = this.portalContext.portalInfo;
  currentPortalMode = this.portalContext.currentMode;
  isDomainLocked = this.portalContext.isDomainLocked;

  isRegistering = signal(false);

  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  authState = signal<AuthState>('idle');
  errorMessage = signal('');

  switchPortal(mode: PortalType) {
    this.portalContext.setPortalMode(mode);
  }

  passwordStrength = computed(() => {
    const pwd = this.password();
    if (!pwd) return 0;
    let strength = 0;
    if (pwd.length >= 6) strength += 25;
    if (pwd.length >= 8) strength += 25;
    if (/[A-Z]/.test(pwd)) strength += 25;
    if (/[0-9!@#$%^&*]/.test(pwd)) strength += 25;
    return strength;
  });

  passwordStrengthLabel = computed(() => {
    const str = this.passwordStrength();
    if (str === 0) return '';
    if (str <= 25) return 'Fraca';
    if (str <= 50) return 'Razoável';
    if (str <= 75) return 'Forte';
    return 'Muito Forte';
  });

  passwordStrengthColor = computed(() => {
    const str = this.passwordStrength();
    if (str <= 25) return 'bg-danger';
    if (str <= 50) return 'bg-warning';
    if (str <= 75) return 'bg-brand';
    return 'bg-success';
  });

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  toggleMode() {
    this.isRegistering.set(!this.isRegistering());
    this.errorMessage.set('');
    this.authState.set('idle');
    this.email.set('');
    this.password.set('');
    this.confirmPassword.set('');
  }

  async handleSubmit() {
    if (this.isRegistering()) {
      await this.handleRegister();
    } else {
      await this.handleLogin();
    }
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
      
      this.operationalAuth.resetSession();
      
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

  async handleRegister() {
    if (!this.email() || !this.password() || !this.confirmPassword()) {
      this.errorMessage.set('Por favor, preencha todos os campos.');
      this.authState.set('error');
      return;
    }

    if (this.password() !== this.confirmPassword()) {
      this.errorMessage.set('As senhas não coincidem.');
      this.authState.set('error');
      return;
    }

    if (this.password().length < 6) {
      this.errorMessage.set('A senha deve ter pelo menos 6 caracteres.');
      this.authState.set('error');
      return;
    }

    this.authState.set('loading');
    this.errorMessage.set('');

    try {
      const { data, error } = await supabase.auth.signUp({
        email: this.email(),
        password: this.password(),
      });

      if (error) throw error;

      if (data.user && data.session === null) {
        await this.notificationService.alert(
          'Conta criada com sucesso! Verifique seu e-mail para confirmar o cadastro.',
          'Quase lá!'
        );
        this.toggleMode();
      } else {
        this.router.navigate(['/onboarding']);
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Erro ao criar conta. Tente novamente.');
      this.authState.set('error');
    } finally {
      if (this.authState() === 'loading') {
        this.authState.set('idle');
      }
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