import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
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
  router = inject(Router);
  notificationService = inject(NotificationService);

  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  authState = signal<AuthState>('idle');
  errorMessage = signal('');

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
