const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/dashboard.component.html', 'utf8');

const target = `    </div>
  }
</div>`;

const replacement = `    </div>

    <!-- Central de Apps -->
    <div class="mt-12 mb-8">
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
           <h2 class="text-2xl font-black text-title tracking-tight">Todos os Apps</h2>
           <p class="text-sm text-muted">Acesse rapidamente todas as funcionalidades do ChefOS.</p>
        </div>
        <div class="flex items-center gap-4">
           <!-- View Mode -->
           <div class="flex items-center bg-surface-elevated rounded-xl p-1 border border-strong shadow-sm">
             <button (click)="viewMode.set('grid')" class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all" [class]="viewMode() === 'grid' ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-title'">
               <span translate="no" class="notranslate material-symbols-outlined text-[18px] mr-1 align-middle">grid_view</span> Grade
             </button>
             <button (click)="viewMode.set('list')" class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all" [class]="viewMode() === 'list' ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-title'">
               <span translate="no" class="notranslate material-symbols-outlined text-[18px] mr-1 align-middle">view_list</span> Lista
             </button>
           </div>
           
           <!-- Sort Mode -->
           <select (change)="sortMode.set($any($event.target).value)" class="bg-surface-elevated border border-strong rounded-xl px-4 py-2 text-sm text-title font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand">
             <option value="default">Ordenar: Padrão</option>
             <option value="name">Ordenar: Nome A-Z</option>
           </select>
        </div>
      </div>

      <!-- Apps Grid/List -->
      <div [class]="viewMode() === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'flex flex-col gap-4'">
        @for(cat of activeCategories(); track cat.id) {
          <div class="bg-surface-elevated border border-subtle rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
                  <span translate="no" class="notranslate material-symbols-outlined text-2xl">{{ cat.icon }}</span>
                </div>
                <div>
                  <h3 class="text-base font-bold text-title">{{ cat.title }}</h3>
                  <p class="text-xs text-muted">{{ cat.items.length }} apps</p>
                </div>
              </div>
            </div>
            
            <p class="text-sm text-muted mb-6 line-clamp-2 h-10">{{ cat.items[0]?.description || 'Acesse aplicativos desta categoria.' }}</p>
            
            <div class="flex items-center gap-2 flex-wrap">
              @for(item of cat.items | slice:0:5; track item.path) {
                <a [routerLink]="item.path" class="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 transition-transform cursor-pointer" [class]="item.color" [title]="item.name">
                  <span translate="no" class="notranslate material-symbols-outlined text-white text-[16px] drop-shadow-sm">{{ item.icon }}</span>
                </a>
              }
              @if(cat.items.length > 5) {
                 <div class="w-8 h-8 rounded-lg bg-surface border border-strong flex items-center justify-center text-xs font-bold text-muted cursor-pointer hover:bg-surface-elevated hover:text-title">
                   +{{ cat.items.length - 5 }}
                 </div>
              }
              <div class="flex-1"></div>
              <button class="w-8 h-8 rounded-full border border-subtle flex items-center justify-center hover:bg-surface-elevated transition-colors text-muted hover:text-title">
                 <span translate="no" class="notranslate material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  }
</div>`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/dashboard/dashboard.component.html', content);
