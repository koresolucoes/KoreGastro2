const fs = require('fs');
let content = fs.readFileSync('src/components/auth/employee-selection.component.ts', 'utf8');

content = content.replace(
  "import { Html5Qrcode } from 'html5-qrcode';",
  "// @ts-ignore\nimport { Html5Qrcode } from 'html5-qrcode/cjs/html5-qrcode';"
);

fs.writeFileSync('src/components/auth/employee-selection.component.ts', content);
