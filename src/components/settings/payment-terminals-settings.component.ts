import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { SettingsStateService } from '../../services/settings-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { ToastService } from '../../services/toast.service';
import { UnitContextService } from '../../services/unit-context.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-terminals-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
         <div>
            <h2 class="text-lg font-bold text-title">Maquininhas (LIO/Stone/etc)</h2>
            <p class="text-sm text-muted">Integração com terminais de pagamento para envio direto do valor.</p>
         </div>
         <button (click)="openForm()" class="px-4 py-2 bg-brand text-white rounded-lg font-bold hover:bg-brand/90 transition-colors shadow-md text-sm flex items-center gap-2">
            <span translate="no" class="notranslate material-symbols-outlined text-[18px]">add</span>
            Adicionar Maquininha
         </button>
      </div>

      <!-- Terminals List -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        @for(terminal of terminals(); track terminal.id) {
          <div class="bg-surface border border-subtle rounded-xl p-4 shadow-sm flex flex-col relative group">
            <div class="flex justify-between items-start mb-3">
               <div>
                 <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-widest bg-brand/10 text-brand mb-2">
                   {{ getProviderLabel(terminal.provider) }}
                 </span>
                 <h3 class="font-bold text-title text-base">{{ terminal.name }}</h3>
               </div>
               
               <div class="flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <button (click)="editTerminal(terminal)" class="p-1.5 text-muted hover:text-brand transition-colors rounded-lg hover:bg-surface-elevated">
                     <span translate="no" class="notranslate material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button (click)="deleteTerminal(terminal)" class="p-1.5 text-muted hover:text-danger transition-colors rounded-lg hover:bg-surface-elevated">
                     <span translate="no" class="notranslate material-symbols-outlined text-[18px]">delete</span>
                  </button>
               </div>
            </div>
            
            <div class="text-sm text-muted">
               <div><span class="font-bold">ID Lógico/Device:</span> <span class="font-mono">{{ terminal.identifier }}</span></div>
               <div><span class="font-bold">Status:</span> 
                  <span [class.text-success]="terminal.is_active" [class.text-danger]="!terminal.is_active">
                     {{ terminal.is_active ? 'Ativa' : 'Inativa' }}
                  </span>
               </div>
            </div>
          </div>
        } @empty {
            <div class="col-span-full bg-surface border border-dashed border-strong rounded-xl p-8 text-center text-muted">
               <span translate="no" class="notranslate material-symbols-outlined text-[48px] text-strong mb-4">point_of_sale</span>
               <p class="font-bold text-title">Nenhuma maquininha cadastrada</p>
               <p class="text-sm mt-1">Integre seu Chefos com terminais Smart para pagamentos automáticos.</p>
            </div>
        }
      </div>

      <!-- Terminal Modal Form -->
      @if(isModalOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in" (click)="closeForm()">
          <div class="bg-surface rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
             
             <div class="p-5 border-b border-subtle flex justify-between items-center bg-surface-elevated">
                <h3 class="text-lg font-black text-title">{{ editingTerminal() ? 'Editar Maquininha' : 'Nova Maquininha' }}</h3>
                <button (click)="closeForm()" class="p-2 text-muted hover:text-title hover:bg-surface rounded-full transition-colors">
                   <span translate="no" class="notranslate material-symbols-outlined">close</span>
                </button>
             </div>

             <div class="p-5 overflow-y-auto" [formGroup]="form">
                <div class="space-y-4">
                   <div>
                      <label class="block text-xs font-bold uppercase tracking-widest text-muted mb-1 ml-1">Nome(Apelido)</label>
                      <input type="text" formControlName="name" placeholder="Ex: Caixa Balcão" class="w-full bg-surface-elevated border border-strong rounded-xl px-4 py-2.5 text-title focus:outline-none focus:border-brand shadow-inner">
                   </div>
                   
                   <div>
                      <label class="block text-xs font-bold uppercase tracking-widest text-muted mb-1 ml-1">Provedor</label>
                      <select formControlName="provider" class="w-full bg-surface-elevated border border-strong rounded-xl px-4 py-2.5 text-title focus:outline-none focus:border-brand shadow-inner appearance-none">
                         <option value="cielo_lio">Cielo LIO V3/V4</option>
                         <option value="stone">Stone Smart</option>
                         <option value="pagseguro">PagBank</option>
                         <option value="mercado_pago">Mercado Pago Point Smart</option>
                      </select>
                   </div>
                   
                   <div>
                      <label class="block text-xs font-bold uppercase tracking-widest text-muted mb-1 ml-1">Identificador da Máquina</label>
                      <input type="text" formControlName="identifier" placeholder="Nº Lógico, EC ou Serial" class="w-full bg-surface-elevated border border-strong rounded-xl px-4 py-2.5 text-title focus:outline-none focus:border-brand shadow-inner">
                      <p class="text-[11px] text-muted mt-1 ml-1">Para a Cielo, é o Terminal ID ou Nº Lógico da máquina LIO.</p>
                   </div>
                   
                   <!-- Credentials Object (Render base on provider if needed later) -->
                   @if (form.get('provider')?.value === 'cielo_lio') {
                      <div class="bg-surface-elevated p-3 rounded-xl border border-strong space-y-3" formGroupName="credentials">
                         <p class="text-xs font-bold text-title mb-2">Credenciais LIO</p>
                         <div>
                            <label class="block text-[10px] uppercase font-bold text-muted mb-1">Client ID</label>
                            <input type="text" formControlName="clientId" class="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-sm text-title focus:border-brand">
                         </div>
                         <div>
                            <label class="block text-[10px] uppercase font-bold text-muted mb-1">Access Token</label>
                            <input type="password" formControlName="accessToken" class="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-sm text-title focus:border-brand">
                         </div>
                         <div>
                            <label class="block text-[10px] uppercase font-bold text-muted mb-1">Merchant ID (EC)</label>
                            <input type="text" formControlName="merchantId" class="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-sm text-title focus:border-brand">
                         </div>
                      </div>
                   }

                   <div class="flex items-center gap-2 mt-4 pt-4 border-t border-subtle">
                      <input type="checkbox" id="isActiveTerm" formControlName="is_active" class="w-4 h-4 text-brand rounded border-strong bg-surface-elevated focus:ring-brand focus:ring-2">
                      <label for="isActiveTerm" class="text-sm font-semibold text-title">Maquininha Ativa</label>
                   </div>
                </div>
             </div>

             <div class="p-5 border-t border-subtle bg-surface-elevated flex justify-end gap-3 flex-shrink-0">
                <button (click)="closeForm()" class="px-5 py-2.5 font-bold rounded-xl text-muted hover:bg-surface border border-transparent hover:border-strong transition-all">Cancelar</button>
                <button (click)="saveTerminal()" [disabled]="form.invalid || isSaving()" class="px-6 py-2.5 font-black rounded-xl text-white bg-brand hover:bg-brand/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                   {{ isSaving() ? 'Salvando...' : 'Salvar Maquininha' }}
                </button>
             </div>
          </div>
        </div>
      }
    </div>
  `
})
export class PaymentTerminalsSettingsComponent {
  private fb = inject(FormBuilder);
  private settingsState = inject(SettingsStateService);
  private settingsData = inject(SettingsDataService);
  private toast = inject(ToastService);
  private unitContext = inject(UnitContextService);

  terminals = computed(() => this.settingsState.paymentTerminals());

  isModalOpen = signal(false);
  isSaving = signal(false);
  editingTerminal = signal<any | null>(null);

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    provider: ['cielo_lio', Validators.required],
    identifier: ['', Validators.required],
    is_active: [true],
    credentials: this.fb.group({
      clientId: [''],
      accessToken: [''],
      merchantId: ['']
    })
  });

  getProviderLabel(provider: string): string {
     const labels:Record<string,string> = {
        'cielo_lio': 'Cielo LIO',
        'stone': 'Stone',
        'pagseguro': 'PagBank',
        'mercado_pago': 'Mercado Pago'
     };
     return labels[provider] || provider;
  }

  openForm(terminal?: any) {
    if (terminal) {
      this.editingTerminal.set(terminal);
      // Try to parse credentials safely
      let creds = terminal.credentials || {};
      this.form.patchValue({
        name: terminal.name,
        provider: terminal.provider,
        identifier: terminal.identifier,
        is_active: terminal.is_active,
        credentials: {
           clientId: creds.clientId || '',
           accessToken: creds.accessToken || '',
           merchantId: creds.merchantId || '',
        }
      });
    } else {
      this.editingTerminal.set(null);
      this.form.reset({ provider: 'cielo_lio', is_active: true });
    }
    this.isModalOpen.set(true);
  }

  closeForm() {
    this.isModalOpen.set(false);
  }

  async saveTerminal() {
    if (this.form.invalid) {
      this.toast.show('Preencha os campos obrigatórios.', 'warning');
      return;
    }

    const userId = this.unitContext.activeUnitId();
    if (!userId) return;

    this.isSaving.set(true);
    const formValue = this.form.value;
    
    // Cleanup empty credentials keys so it doesn't store empty stuff
    const creds = formValue.credentials;
    if (creds && typeof creds === 'object') {
       Object.keys(creds).forEach(k => { if (!creds[k]) delete creds[k]; });
    }

    try {
      if (this.editingTerminal()) {
        const id = this.editingTerminal()!.id;
        const { success, error } = await this.settingsData.updatePaymentTerminal(id, formValue);
        if (success) {
          this.toast.show('Maquininha atualizada.', 'success');
          // Update State manually
          this.settingsState.paymentTerminals.update(ts => ts.map(t => t.id === id ? { ...t, ...formValue } : t));
          this.closeForm();
        } else throw error;
      } else {
        const { success, data, error } = await this.settingsData.addPaymentTerminal(userId, formValue);
        if (success && data) {
          this.toast.show('Maquininha adicionada.', 'success');
          // Update State manually
          this.settingsState.paymentTerminals.update(ts => [...ts, data]);
          this.closeForm();
        } else throw error;
      }
    } catch (e: any) {
      console.error(e);
      this.toast.show('Erro ao salvar maquininha: ' + e.message, 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteTerminal(terminal: any) {
    if (confirm(`Remover a maquininha ${terminal.name}?`)) {
      try {
        const { success, error } = await this.settingsData.deletePaymentTerminal(terminal.id);
        if (success) {
           this.settingsState.paymentTerminals.update(t => t.filter(x => x.id !== terminal.id));
           this.toast.show('Maquininha removida.', 'success');
        } else {
           throw error;
        }
      } catch (e: any) {
         this.toast.show('Erro ao remover: ' + (e.message || ''), 'error');
      }
    }
  }
}
