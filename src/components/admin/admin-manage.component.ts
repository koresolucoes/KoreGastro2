import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemAdminService } from '../../services/system-admin.service';

@Component({
  selector: 'app-admin-manage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="animate-fade-in-up max-w-4xl">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-white">Gerenciar Administradores</h2>
      </div>

      <!-- Add Admin Form -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h3 class="text-lg font-medium text-gray-300 mb-4">Adicionar Novo Admin</h3>
        <form (ngSubmit)="addAdmin()" class="flex gap-4">
          <input 
            type="email" 
            [(ngModel)]="newAdminEmail" 
            name="email" 
            placeholder="E-mail do novo administrador" 
            class="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
            required
          >
          <button 
            type="submit" 
            [disabled]="isLoading() || !newAdminEmail"
            class="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            @if(isLoading()) {
              <span class="material-symbols-outlined animate-spin text-sm">sync</span>
            } @else {
              <span class="material-symbols-outlined text-sm">person_add</span>
            }
            Adicionar
          </button>
        </form>
        @if(errorMessage()) {
          <p class="text-red-400 text-sm mt-2">{{ errorMessage() }}</p>
        }
      </div>

      <!-- Admins List -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-950 border-b border-gray-800 text-gray-400 text-sm">
              <th class="p-4 font-medium">E-mail</th>
              <th class="p-4 font-medium">Data de Adição</th>
              <th class="p-4 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            @for(admin of admins(); track admin.email) {
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                <td class="p-4 text-gray-200 flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs uppercase">
                    {{ admin.email.charAt(0) }}
                  </div>
                  {{ admin.email }}
                  @if(admin.email === 'koresoluciones@outlook.com') {
                    <span class="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded-full font-bold">Master</span>
                  }
                </td>
                <td class="p-4 text-gray-400 text-sm">{{ admin.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                <td class="p-4 text-right">
                  @if(admin.email !== 'koresoluciones@outlook.com') {
                    <button (click)="removeAdmin(admin.email)" class="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-400/10 transition-colors" title="Remover acesso">
                      <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                  }
                </td>
              </tr>
            }
            @if(admins().length === 0 && !isLoading()) {
              <tr>
                <td colspan="3" class="p-8 text-center text-gray-500">Nenhum administrador encontrado.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class AdminManageComponent implements OnInit {
  adminService = inject(SystemAdminService);
  
  admins = signal<any[]>([]);
  isLoading = signal(false);
  newAdminEmail = '';
  errorMessage = signal('');

  ngOnInit() {
    this.loadAdmins();
  }

  async loadAdmins() {
    this.isLoading.set(true);
    const { data, error } = await this.adminService.getAdmins();
    if (data) this.admins.set(data);
    this.isLoading.set(false);
  }

  async addAdmin() {
    if (!this.newAdminEmail) return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    
    const { error } = await this.adminService.addAdmin(this.newAdminEmail.trim().toLowerCase());
    
    if (error) {
      this.errorMessage.set('Erro ao adicionar admin. Verifique se o e-mail já existe.');
    } else {
      this.newAdminEmail = '';
      await this.loadAdmins();
    }
    this.isLoading.set(false);
  }

  async removeAdmin(email: string) {
    if (confirm(`Tem certeza que deseja remover o acesso de ${email}?`)) {
      this.isLoading.set(true);
      await this.adminService.removeAdmin(email);
      await this.loadAdmins();
    }
  }
}
