import { Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerAuthService } from '../../../services/customer-auth.service';

@Component({
  selector: 'app-menu-auth',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-2xl font-black text-title">{{ isLogin() ? 'Acessar Conta' : 'Criar Conta' }}</h2>
        <button (click)="close.emit()" class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-elevated text-muted hover:text-title hover:shadow-sm transition-all border border-transparent hover:border-strong">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="space-y-6">
        @if (!isLogin()) {
          <div class="space-y-2">
            <label class="text-sm font-bold text-body ml-1">Seu Nome</label>
            <input type="text" [(ngModel)]="name" placeholder="Ex: João Silva" class="w-full px-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-brand focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium relative">
          </div>
        }

        <div class="space-y-2">
          <label class="text-sm font-bold text-body ml-1">CPF</label>
          <input type="text" [(ngModel)]="cpf" placeholder="000.000.000-00" class="w-full px-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-brand focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium relative">
        </div>

        @if (!isLogin()) {
          <div class="space-y-2">
            <label class="text-sm font-bold text-body ml-1">WhatsApp</label>
            <input type="tel" [(ngModel)]="phone" placeholder="(00) 00000-0000" class="w-full px-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-brand focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium relative">
          </div>
        }

        <div class="space-y-2">
          <label class="text-sm font-bold text-body ml-1">Senha (PIN)</label>
          <input type="password" [(ngModel)]="password" placeholder="Sua senha secreta" class="w-full px-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-brand focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium relative">
        </div>

        @if (errorMsg()) {
          <div class="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm font-medium text-center">
            {{ errorMsg() }}
          </div>
        }

        <button (click)="submit()" [disabled]="isLoading()" class="w-full py-4 bg-brand text-on-brand rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-brand/20 disabled:opacity-50">
          @if (isLoading()) {
            <span class="material-symbols-outlined animate-spin">progress_activity</span>
          } @else {
            <span>{{ isLogin() ? 'Entrar' : 'Cadastrar' }}</span>
          }
        </button>

        <div class="text-center pt-4">
          <button (click)="toggleMode()" class="text-brand font-bold text-sm hover:underline">
            {{ isLogin() ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça login' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class MenuAuthComponent {
  authService = inject(CustomerAuthService);
  close = output<void>();
  
  storeId = input.required<string>();

  isLogin = signal(true);
  isLoading = signal(false);
  errorMsg = signal('');

  name = '';
  cpf = '';
  phone = '';
  password = '';

  toggleMode() {
    this.isLogin.set(!this.isLogin());
    this.errorMsg.set('');
  }

  async submit() {
    if (!this.cpf || !this.password || (!this.isLogin() && (!this.name || !this.phone))) {
      this.errorMsg.set('Preencha todos os campos obrigatórios.');
      return;
    }

    this.isLoading.set(true);
    this.errorMsg.set('');

    try {
      const res = this.isLogin() 
        ? await this.authService.authenticate(this.storeId(), this.cpf, this.password)
        : await this.authService.register(this.storeId(), this.name, this.phone, this.cpf, this.password);

      if (res.success) {
        this.close.emit();
      } else {
        this.errorMsg.set(res.message || 'Ocorreu um erro.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}

