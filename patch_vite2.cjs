const fs = require('fs');
let content = fs.readFileSync('vite.config.ts', 'utf8');

if (!content.includes('html5-qrcode')) {
  content = content.replace(
    'export default defineConfig({',
    `export default defineConfig({\n  optimizeDeps: {\n    include: ['html5-qrcode']\n  },\n  resolve: {\n    alias: {\n      'html5-qrcode': 'html5-qrcode/html5-qrcode.js'\n    }\n  },`
  );
  fs.writeFileSync('vite.config.ts', content);
  console.log("Patched vite.config.ts");
} else {
  console.log("Already patched");
}
