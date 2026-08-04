const fs = require('fs');
const file = 'src/components/kds/kds.component.html';
let content = fs.readFileSync(file, 'utf8');

const itemsTemplate = `
                      <!-- ITEMS PREVIEW SUMMARY -->
                      <div class="mt-2 space-y-1.5 border-t border-dashed border-strong/40 pt-2 shrink-0 max-h-[150px] overflow-y-auto custom-scrollbar">
                          @if(order.source === 'iFood') {
                             @for(item of getIfoodRawItems(order); track item.id || $index) {
                                <div class="text-xs">
                                   <p class="text-muted leading-tight"><span class="font-bold text-title">{{ item.quantity }}x</span> {{ item.name }}</p>
                                   @if(item.options && item.options.length > 0) {
                                      <div class="pl-4 mt-0.5 space-y-0.5">
                                         @for(opt of item.options; track opt.id || $index) {
                                             <p class="text-[10px] text-muted leading-tight text-opacity-80">+ {{ opt.quantity > 1 ? opt.quantity + 'x ' : '' }}{{ opt.name }}</p>
                                         }
                                      </div>
                                   }
                                   @if(item.observations) {
                                      <p class="text-[10px] font-semibold text-warning bg-warning/10 px-1 py-0.5 mt-0.5 rounded border border-warning/20">Nota: {{ item.observations }}</p>
                                   }
                                </div>
                             }
                          } @else {
                             @for(item of order.order_items; track item.id) {
                                <div class="text-xs">
                                   <p class="text-muted leading-tight"><span class="font-bold text-title">{{ item.quantity }}x</span> {{ item.name }}</p>
                                   @if(item.notes) {
                                      <p class="text-[10px] font-semibold text-warning bg-warning/10 px-1 py-0.5 mt-0.5 rounded border border-warning/20">Nota: {{ item.notes }}</p>
                                   }
                                </div>
                             }
                          }
                      </div>
`;

content = content.replace(
  /<!-- Actions inside Column 1 -->/g,
  itemsTemplate + '\n                      <!-- Actions inside Column 1 -->'
);

content = content.replace(
  /<!-- Actions inside Column 2 -->/g,
  itemsTemplate + '\n                      <!-- Actions inside Column 2 -->'
);

content = content.replace(
  /<!-- Actions inside Column 3 -->/g,
  itemsTemplate + '\n                      <!-- Actions inside Column 3 -->'
);

content = content.replace(
  /<!-- Actions inside Column 4 -->/g,
  itemsTemplate + '\n                      <!-- Actions inside Column 4 -->'
);

fs.writeFileSync(file, content);
