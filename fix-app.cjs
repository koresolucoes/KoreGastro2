const fs = require('fs');
let content = fs.readFileSync('src/app.component.ts', 'utf8');
content = content.replace(
  "import { SubscriptionComponent } from './components/subscription/subscription.component';",
  ""
);
content = content.replace(
  "SubscriptionComponent,",
  ""
);
fs.writeFileSync('src/app.component.ts', content);
