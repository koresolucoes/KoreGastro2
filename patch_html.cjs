const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const htmlModals = `      <!-- Catalog Edit / Add Modals -->
      @if (editingMenuItem()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center border-b border-white/10 p-4 bg-gray-950">
              <h3 class="font-bold text-white text-base">
                {{ isAddingMenuItem() ? 'Adicionar Produto ao Cardápio' : 'Editar Produto' }}
              </h3>
              <button (click)="isAddingMenuItem() ? cancelAddMenuItem() : cancelEditMenuItem()" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="p-6 space-y-4">
              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Nome do Produto</label>
                <input type="text" [(ngModel)]="editingMenuItem()!.name" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: Pizza Margherita">
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Preço (R$)</label>
                  <input type="number" step="0.01" [(ngModel)]="editingMenuItem()!.price" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Tempo de Preparo (min)</label>
                  <input type="number" [(ngModel)]="editingMenuItem()!.prep_time" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none">
                </div>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Categoria</label>
                <input type="text" [(ngModel)]="editingMenuItem()!.category" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: Pratos Principais">
              </div>

              <div class="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 mt-2">
                <input type="checkbox" [(ngModel)]="editingMenuItem()!.is_available" id="itemAvailable" class="w-5 h-5 accent-orange-500 rounded cursor-pointer">
                <label for="itemAvailable" class="font-bold text-sm text-white cursor-pointer select-none">Disponível para Venda</label>
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3">
              <button (click)="isAddingMenuItem() ? cancelAddMenuItem() : cancelEditMenuItem()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="isAddingMenuItem() ? saveNewMenuItem() : saveEditedMenuItem()" [disabled]="isLoading()" class="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50">
                Salvar
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Modal Drawer -->`;

code = code.replace(/      <!-- Edit Modal Drawer -->/, htmlModals);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Patched component HTML.');
