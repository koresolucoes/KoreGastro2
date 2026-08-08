const fs = require('fs');
let envCode = fs.readFileSync('src/config/environment.ts', 'utf8');
envCode = envCode.replace(/'' \|\| ''/g, "''");
envCode = envCode.replace(/\('' \|\| ''\)/g, "''");
fs.writeFileSync('src/config/environment.ts', envCode);
