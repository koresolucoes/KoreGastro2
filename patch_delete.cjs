const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s1 = `  // Selected Profile for edits`;
const r1 = `  deletingPlan = signal<any>(null);
  // Selected Profile for edits`;
code = code.replace(s1, r1);

const s2 = `  async deletePlan(plan: any) {
    if (confirm(\`Remover o plano \${plan.name}?\`)) {
      const { error } = await this.adminService.deletePlan(plan.id);
      if (error) {
        this.notificationService.alert('Erro ao excluir plano: ' + error.message);
      } else {
        this.notificationService.show('Plano excluído com sucesso.', 'success');
        await this.loadData();
      }
    }
  }`;
const r2 = `  async deletePlan(plan: any) {
    this.deletingPlan.set(plan);
  }
  
  async confirmDeletePlan() {
    const plan = this.deletingPlan();
    if (!plan) return;
    this.deletingPlan.set(null);
    this.isLoading.set(true);
    const { error } = await this.adminService.deletePlan(plan.id);
    if (error) {
      this.notificationService.alert('Erro ao excluir plano: ' + error.message);
    } else {
      this.notificationService.show('Plano excluído com sucesso.', 'success');
      await this.loadData();
    }
    this.isLoading.set(false);
  }`;
code = code.replace(s2, r2);

const modalHTML = `      <!-- Delete Plan Modal -->
      @if (deletingPlan()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 class="font-bold text-white text-lg text-center">Confirmar Exclusão</h3>
            <p class="text-sm text-gray-300 text-center">Tem certeza que deseja remover o plano <strong class="text-white">{{ deletingPlan().name }}</strong>?</p>
            <div class="flex gap-3 justify-center pt-2">
              <button (click)="deletingPlan.set(null)" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="confirmDeletePlan()" class="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all">Sim, Remover</button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Modal Drawer -->`;

code = code.replace(/      <!-- Edit Modal Drawer -->/, modalHTML);
fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed confirm delete.');
