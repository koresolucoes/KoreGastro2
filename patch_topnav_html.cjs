const fs = require('fs');
let content = fs.readFileSync('src/components/top-nav/top-nav.component.html', 'utf8');

const searchHtml = `
  <div class="flex-1 max-w-xl mx-4 search-container relative hidden md:block">
    <div class="relative group">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <span translate="no" class="notranslate material-symbols-outlined text-muted group-hover:text-brand transition-colors text-[20px]">search</span>
      </div>
      <input type="text" placeholder="Buscar no ChefOS..." 
             [value]="searchQuery()"
             (input)="onSearchInput($event)"
             (focus)="isSearchOpen.set(true)"
             class="w-full bg-surface border border-strong rounded-full pl-10 pr-16 py-2 text-sm text-title placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-all hover:bg-surface-elevated hover:border-subtle shadow-sm">
      <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
        <span class="text-[10px] font-bold text-muted border border-strong rounded px-1.5 py-0.5 bg-surface-elevated">Ctrl+K</span>
      </div>
    </div>

    <!-- Search Dropdown -->
    @if (isSearchOpen() && searchQuery().trim() !== '') {
      <div class="absolute top-full left-0 right-0 mt-2 bg-surface-elevated border border-strong rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
        <div class="p-3">
          <div class="px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-widest flex justify-between items-center mb-1">
             <span>Resultados para "{{ searchQuery() }}"</span>
          </div>
          
          <div class="space-y-1 max-h-[60vh] overflow-y-auto">
            @for (app of searchResults(); track app.path) {
              <a [routerLink]="app.path" (click)="closeSearch()" class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface group transition-all border border-transparent hover:border-strong cursor-pointer">
                <div class="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                  <span translate="no" class="notranslate material-symbols-outlined text-[18px]">{{ app.icon }}</span>
                </div>
                <div class="flex-1">
                  <div class="text-sm font-bold text-title group-hover:text-brand transition-colors">{{ app.name }}</div>
                  <div class="text-[10px] text-muted">{{ app.desc }}</div>
                </div>
                <span translate="no" class="notranslate material-symbols-outlined text-muted opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">arrow_forward</span>
              </a>
            }
            
            @if (searchResults().length === 0) {
              <div class="py-8 text-center text-muted">
                <span translate="no" class="notranslate material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                <p class="text-sm">Nenhum resultado encontrado.</p>
              </div>
            }
          </div>
        </div>
      </div>
    }
  </div>
`;

// Replace the old search button logic
content = content.replace(
  /<div class="flex-1 max-w-xl">[\s\S]*?<\/button>\s*<\/div>/,
  searchHtml
);

// Remove the global search modal
content = content.replace(/<!-- Global Search Modal\/Overlay -->[\s\S]*?<\/div>\s*}/, '');

// Also we should focus the input when Ctrl+K is pressed
// We can add #searchInput to the input and use ViewChild, but for simplicity let's just let the TS handle it if needed. Actually we can do it later if the user requests.

fs.writeFileSync('src/components/top-nav/top-nav.component.html', content);
