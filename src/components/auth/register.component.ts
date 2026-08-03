import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { supabase } from '../../services/supabase-client';

type AuthState = 'idle' | 'loading' | 'error';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  router = inject(Router);
  notificationService = inject(NotificationService);

  email = signal('');
  password = signal('');
  confirmPassword = signal('');
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
      // Usando o supabase client diretamente para o signUp
      const { data, error } = await supabase.auth.signUp({
        email: this.email(),
        password: this.password(),
      });

      if (error) {
        throw error;
      }

      // Se a confirmação de email estiver habilitada no Supabase, o usuário não loga direto
      if (data.user && data.session === null) {
        await this.notificationService.alert(
          'Conta criada com sucesso! Verifique seu e-mail para confirmar o cadastro.',
          'Quase lá!'
        );
        this.router.navigate(['/login']);
      } else {
        // Se logou direto, redireciona
        this.router.navigate(['/onboarding']); // ou dashboard/employee-selection
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
}
