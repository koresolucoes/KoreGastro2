const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s = `<button (click)="editMenuItemPrice(item)" class="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white p-1.5 rounded-lg border border-indigo-500/20 transition-all" title="Alterar Preço">
                          <span translate="no" class="notranslate material-symbols-outlined text-sm">attach_money</span>`;
const r = `<button (click)="editMenuItemPrice(item)" class="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white p-1.5 rounded-lg border border-indigo-500/20 transition-all" title="Editar Detalhes">
                          <span translate="no" class="notranslate material-symbols-outlined text-sm">edit</span>`;

code = code.replace(s, r);
fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
