const fs = require('fs');
const content = fs.readFileSync('src/components/auth/employee-selection.component.ts', 'utf8');
console.log(content.includes('html5-qrcode/cjs/html5-qrcode'));
