const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/dashboard.component.html', 'utf8');

const replacement = `
<!-- Modal de Categoria -->
@if (selectedCategoryForModal(); as cat) {
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
    <div class="absolute inset-0 bg-background/80 backdrop-blur-sm" (click)="selectedCategoryForModal.set(null)"></div>
    <div class="relative w-full max-w-lg bg-surface-elevated border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
      <div class="flex justify-between items-center p-5 sm:p-6 border-b border-strong/50 bg-surface/50">
        <div class="flex items-center gap-4">
           <div class="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
             <span translate="no" class="notranslate material-symbols-outlined">{{ cat.icon }}</span>
           </div>
           <div>
             <h2 class="text-xl font-black text-title tracking-tight">{{ cat.title }}</h2>
           </div>
        </div>
        <button (click)="selectedCategoryForModal.set(null)" class="w-10 h-10 rounded-full bg-surface-elevated border border-strong flex items-center justify-center text-muted hover:text-title hover:bg-surface transition-all active:scale-95">
          <span translate="no" class="notranslate material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
         @for (item of cat.items; track item.path) {
            <a [routerLink]="item.path" (click)="selectedCategoryForModal.set(null)" class="flex items-center gap-4 p-4 rounded-2xl hover:bg-surface border border-transparent hover:border-strong transition-all group cursor-pointer">
               <div class="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform" [class]="item.color">
                 <span translate="no" class="notranslate material-symbols-outlined text-white text-[20px]">{{ item.icon }}</span>
               </div>
               <div class="flex-1">
                 <h3 class="text-sm font-bold text-title group-hover:text-brand transition-colors">{{ item.name }}</h3>
                 <p class="text-xs text-muted mt-0.5">{{ item.description }}</p>
               </div>
               <span translate="no" class="notranslate material-symbols-outlined text-muted opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
            </a>
         }
      </div>
    </div>
  </div>
}
`;

content = content.replace('<!-- Central de Apps -->', replacement + '\n    <!-- Central de Apps -->');
// And make the card clickable to open the modal
content = content.replace(
  '<button class="w-8 h-8 rounded-full border border-subtle flex items-center justify-center hover:bg-surface-elevated transition-colors text-muted hover:text-title">',
  '<button (click)="selectedCategoryForModal.set(cat)" class="w-8 h-8 rounded-full border border-subtle flex items-center justify-center hover:bg-surface-elevated transition-colors text-muted hover:text-title">'
);
content = content.replace(
  '<div class="w-8 h-8 rounded-lg bg-surface border border-strong flex items-center justify-center text-xs font-bold text-muted cursor-pointer hover:bg-surface-elevated hover:text-title">',
  '<div (click)="selectedCategoryForModal.set(cat)" class="w-8 h-8 rounded-lg bg-surface border border-strong flex items-center justify-center text-xs font-bold text-muted cursor-pointer hover:bg-surface-elevated hover:text-title">'
);
fs.writeFileSync('src/components/dashboard/dashboard.component.html', content);
