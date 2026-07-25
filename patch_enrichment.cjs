const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const modalHTMLSearch = `<div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Categoria</label>
                <input type="text" [(ngModel)]="editingMenuItem()!.category" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: Pratos Principais">
              </div>`;

const modalHTMLReplace = `<div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Categoria</label>
                <input type="text" [(ngModel)]="editingMenuItem()!.category" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: Pratos Principais">
              </div>

              <div class="grid grid-cols-2 gap-4 mt-2">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Preço Promocional (Opcional)</label>
                  <input type="number" step="0.01" [(ngModel)]="editingMenuItem()!.promotional_price" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">SKU / Código</label>
                  <input type="text" [(ngModel)]="editingMenuItem()!.sku" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: PIZ-01">
                </div>
              </div>`;

code = code.replace(modalHTMLSearch, modalHTMLReplace);

const updateMethodSearch = `      name: item.name,
      price: item.price,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available,
      category: item.category`;

const updateMethodReplace = `      name: item.name,
      price: item.price,
      promotional_price: item.promotional_price || null,
      sku: item.sku || null,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available,
      category: item.category`;

code = code.replace(updateMethodSearch, updateMethodReplace);

const insertMethodSearch = `      name: item.name,
      category: item.category || 'Geral',
      price: item.price,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available`;

const insertMethodReplace = `      name: item.name,
      category: item.category || 'Geral',
      price: item.price,
      promotional_price: item.promotional_price || null,
      sku: item.sku || null,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available`;

code = code.replace(insertMethodSearch, insertMethodReplace);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed enrichment in admin component');
