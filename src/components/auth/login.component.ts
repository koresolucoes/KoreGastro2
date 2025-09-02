
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

type AuthState = 'idle' | 'loading' | 'error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);

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
      // On successful login, auth service's onAuthStateChange will trigger,
      // and the auth guard will automatically handle the redirect.
      // We can also force a redirect here.
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.errorMessage.set('E-mail ou senha inválidos.');
      this.authState.set('error');
    }
  }
}