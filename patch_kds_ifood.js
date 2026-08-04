const fs = require('fs');
const file = 'src/components/kds/kds.component.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('getIfoodRawItems')) {
  content = content.replace(
    '// View toggles',
    `getIfoodRawItems(order: any) {
    if (order.source !== 'iFood' || !order.ifood_order_id) return [];
    const log = this.webhookLogs().find(l => l.ifood_order_id === order.ifood_order_id && l.raw_payload && l.raw_payload.items);
    return log?.raw_payload?.items || [];
  }

  // View toggles`
  );
  fs.writeFileSync(file, content);
}
