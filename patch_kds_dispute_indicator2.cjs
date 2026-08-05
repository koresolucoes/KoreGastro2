const fs = require('fs');
const file = 'src/components/kds/kds.component.html';
let content = fs.readFileSync(file, 'utf8');

const disputeBanner = `
                      <!-- Dispute Alert on Card -->
                      @if(order.ifood_dispute_id) {
                        <div class="bg-danger/10 border border-danger/20 text-danger p-2 rounded-xl flex items-center justify-between animate-pulse shrink-0 shadow-sm mt-1 mb-1">
                          <div class="flex items-center gap-1.5 min-w-0">
                             <span translate="no" class="notranslate material-symbols-outlined text-sm shrink-0">error</span>
                             <span class="font-black text-[9px] uppercase tracking-widest truncate leading-none pt-0.5">Disputa Aberta!</span>
                          </div>
                        </div>
                      }
`;

content = content.replace(
  /<!-- Details -->/g,
  disputeBanner + '\n                      <!-- Details -->'
);

fs.writeFileSync(file, content);
