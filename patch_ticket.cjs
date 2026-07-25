const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const signalDeclarations = `  // Support Workstation State
  supportTickets = signal<any[]>([]);
  selectedTicket = signal<any | null>(null);
  replyText = '';
  isCreatingTicket = signal(false);
  newTicketProfile = signal<any>(null);
  newTicketSubject = '';`;
code = code.replace(/  \/\/ Support Workstation State\n  supportTickets = signal<any\[\]>\(\[\]\);\n  selectedTicket = signal<any \| null>\(null\);\n  replyText = '';/, signalDeclarations);

const methodReplacements = `  async openTicketForProfile(profile: any) {
    this.newTicketProfile.set(profile);
    this.newTicketSubject = 'Atendimento Ativo (Suporte)';
    this.isCreatingTicket.set(true);
  }

  cancelCreateTicket() {
    this.isCreatingTicket.set(false);
    this.newTicketProfile.set(null);
    this.newTicketSubject = '';
  }

  async saveNewTicket() {
    const profile = this.newTicketProfile();
    if (!profile) return;
    const subject = this.newTicketSubject.trim();
    if (!subject) {
      this.notificationService.show('O assunto é obrigatório', 'error');
      return;
    }

    this.isLoading.set(true);
    const newTicket = {
      client_id: profile.id,
      store_name: profile.stores?.[0]?.name || 'Unidade Principal',
      subject: subject,
      priority: 'Média',
      messages: [
        { sender_type: 'system', text: 'Chamado aberto ativamente pelo Suporte KOR.' }
      ]
    };
    
    await this.adminService.addSupportTicket(newTicket);
    await this.loadSupportTickets();
    this.notificationService.show('Chamado aberto com sucesso', 'success');
    this.cancelCreateTicket();
    this.activeTab.set('support');
    this.isLoading.set(false);
  }`;

code = code.replace(/  async openTicketForProfile\(profile: any\) \{[\s\S]*?this\.activeTab\.set\('support'\);\n  \}/, methodReplacements);

const htmlModals = `      <!-- Create Ticket Modal -->
      @if (isCreatingTicket()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center border-b border-white/10 p-4 bg-gray-950">
              <h3 class="font-bold text-white text-base">
                Abrir Novo Chamado
              </h3>
              <button (click)="cancelCreateTicket()" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="p-6 space-y-4">
              <div class="bg-white/5 p-3 rounded-xl">
                <p class="text-xs text-gray-400">Cliente</p>
                <p class="font-bold text-white">{{ newTicketProfile()?.full_name }}</p>
                <p class="text-[11px] text-gray-500">{{ newTicketProfile()?.email }}</p>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Assunto do Chamado</label>
                <input type="text" [(ngModel)]="newTicketSubject" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none" placeholder="Ex: Dúvida sobre plano">
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3">
              <button (click)="cancelCreateTicket()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="saveNewTicket()" [disabled]="isLoading()" class="bg-cyan-600 hover:bg-cyan-500 text-gray-950 px-6 py-2 rounded-xl text-sm font-black uppercase shadow-lg transition-all disabled:opacity-50">
                Abrir Chamado
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Modal Drawer -->`;

code = code.replace(/      <!-- Edit Modal Drawer -->/, htmlModals);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Patched ticket creation modal.');
