const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const modalHtml = `      <!-- Create Ticket Modal -->
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
              @if (newTicketProfile()) {
                <div class="bg-white/5 p-3 rounded-xl">
                  <p class="text-xs text-gray-400">Cliente</p>
                  <p class="font-bold text-white">{{ newTicketProfile()?.full_name }}</p>
                  <p class="text-[11px] text-gray-500">{{ newTicketProfile()?.email }}</p>
                </div>
              } @else {
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Selecionar Cliente</label>
                  <select [ngModel]="newTicketProfile()?.id" (ngModelChange)="setNewTicketProfile($event)" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none">
                    <option [value]="null">Selecione um cliente...</option>
                    @for(rest of restaurants(); track rest.id) {
                      <option [value]="rest.id">{{ rest.full_name }} ({{ rest.email }})</option>
                    }
                  </select>
                </div>
              }

              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Assunto do Chamado</label>
                <input type="text" [(ngModel)]="newTicketSubject" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none" placeholder="Ex: Dúvida sobre plano">
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3">
              <button (click)="cancelCreateTicket()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="saveNewTicket()" [disabled]="isLoading() || !newTicketProfile()" class="bg-cyan-600 hover:bg-cyan-500 text-gray-950 px-6 py-2 rounded-xl text-sm font-black uppercase shadow-lg transition-all disabled:opacity-50">
                Abrir Chamado
              </button>
            </div>
          </div>
        </div>
      }`;

code = code.replace(/      <!-- Create Ticket Modal -->[\s\S]*?<\/div>\n        <\/div>\n      \}/, modalHtml);

const methodHtml = `  async openNewTicketPrompt() {
    this.newTicketProfile.set(null);
    this.newTicketSubject = '';
    this.isCreatingTicket.set(true);
  }

  setNewTicketProfile(profileId: string) {
    const profile = this.restaurants().find(p => p.id === profileId);
    this.newTicketProfile.set(profile || null);
  }`;

code = code.replace(/  async openNewTicketPrompt\(\) \{[\s\S]*?this\.notificationService\.show\('Novo chamado de atendimento criado!', 'success'\);\n  \}/, methodHtml);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Patched openNewTicketPrompt.');
