const fs = require('fs');

function replace(file, search, replace) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replace);
    fs.writeFileSync(file, content);
}

replace('src/components/auth/employee-selection.component.ts', /error\.message/g, '(error as any).message');
replace('src/services/operational-auth.service.ts', /err\.message/g, '(err as any).message');
replace('src/components/purchasing/purchasing.component.ts', /version:/g, '// version:');

