const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s1 = `  // Selected Profile for edits`;
const r1 = `  // Plan Editing State
  editingPlan = signal<any>(null);
  planModules = [
    { key: 'tables', label: 'Gestão de Mesas' },
    { key: 'pdv', label: 'PDV & Frente de Caixa' },
    { key: 'kitchen', label: 'KDS (Cozinha)' },
    { key: 'waiter', label: 'App do Garçom' },
    { key: 'delivery', label: 'Delivery Próprio' },
    { key: 'ifood', label: 'Integração iFood' },
    { key: 'financial', label: 'Gestão Financeira' },
    { key: 'inventory', label: 'Estoque Avançado' },
    { key: 'loyalty', label: 'Fidelidade' }
  ];

  // Selected Profile for edits`;

code = code.replace(s1, r1);

const s2 = `  async openCreatePlanModal() {`;
const r2 = `  async editPlan(plan: any) {
    this.editingPlan.set({
      ...plan,
      activeModules: plan.plan_permissions?.map((p: any) => p.permission_key) || []
    });
  }

  cancelEditPlan() {
    this.editingPlan.set(null);
  }

  togglePlanModule(moduleKey: string) {
    const plan = this.editingPlan();
    if (!plan) return;
    
    let modules = [...plan.activeModules];
    if (modules.includes(moduleKey)) {
      modules = modules.filter(m => m !== moduleKey);
    } else {
      modules.push(moduleKey);
    }
    this.editingPlan.set({ ...plan, activeModules: modules });
  }

  async saveEditedPlan() {
    const plan = this.editingPlan();
    if (!plan) return;
    
    this.isLoading.set(true);
    const { error } = await this.adminService.updatePlan(plan.id, {
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      trial_period_days: plan.trial_period_days,
      max_stores: plan.max_stores
    });
    
    if (error) {
      this.notificationService.alert('Erro ao atualizar plano: ' + error.message);
    } else {
      await this.adminService.updatePlanPermissions(plan.id, plan.activeModules);
      this.notificationService.show('Plano atualizado com sucesso!', 'success');
      this.cancelEditPlan();
      await this.loadData();
    }
    this.isLoading.set(false);
  }

  async openCreatePlanModal() {`;

code = code.replace(s2, r2);

const s3 = `                  <div class="pt-4 border-t border-white/5 flex gap-2">
                    <button (click)="deletePlan(plan)" class="text-red-400 hover:text-red-300 text-xs p-2 rounded-xl hover:bg-red-500/10 transition-all">
                      Remover
                    </button>
                  </div>`;
const r3 = `                  <div class="pt-4 border-t border-white/5 flex gap-2 justify-between">
                    <button (click)="editPlan(plan)" class="text-indigo-400 hover:text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-indigo-500/10 transition-all">
                      Editar Plano
                    </button>
                    <button (click)="deletePlan(plan)" class="text-red-400 hover:text-red-300 text-[10px] p-2 rounded-xl hover:bg-red-500/10 transition-all" title="Remover Plano">
                      <span translate="no" class="notranslate material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>`;

code = code.replace(s3, r3);

const htmlModals = `      <!-- Edit Plan Modal -->
      @if (editingPlan()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex justify-between items-center border-b border-white/10 p-4 bg-gray-950 shrink-0">
              <h3 class="font-bold text-white text-base">
                Editar Plano: {{ editingPlan().name }}
              </h3>
              <button (click)="cancelEditPlan()" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="p-6 space-y-4 overflow-y-auto">
              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Nome do Plano</label>
                <input type="text" [(ngModel)]="editingPlan().name" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Slug / Código</label>
                  <input type="text" [(ngModel)]="editingPlan().slug" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-[11px]">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Preço (R$)</label>
                  <input type="number" step="0.01" [(ngModel)]="editingPlan().price" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Máx. Lojas</label>
                  <input type="number" [(ngModel)]="editingPlan().max_stores" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Dias Teste</label>
                  <input type="number" [(ngModel)]="editingPlan().trial_period_days" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                </div>
              </div>

              <div class="pt-4 border-t border-white/10">
                <h4 class="font-bold text-white text-sm mb-3">Módulos & Permissões</h4>
                <div class="space-y-2">
                  @for(mod of planModules; track mod.key) {
                    <div class="flex items-center gap-3 bg-white/5 p-2.5 rounded-xl border border-white/10">
                      <input 
                        type="checkbox" 
                        [id]="'mod_' + mod.key" 
                        [checked]="editingPlan().activeModules?.includes(mod.key)"
                        (change)="togglePlanModule(mod.key)"
                        class="w-5 h-5 accent-indigo-500 rounded cursor-pointer"
                      >
                      <label [for]="'mod_' + mod.key" class="font-bold text-xs text-white cursor-pointer select-none flex-1">{{ mod.label }}</label>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3 shrink-0">
              <button (click)="cancelEditPlan()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="saveEditedPlan()" [disabled]="isLoading()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50">
                Salvar Plano
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Modal Drawer -->`;

code = code.replace(/      <!-- Edit Modal Drawer -->/, htmlModals);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Patched admin plans.');
