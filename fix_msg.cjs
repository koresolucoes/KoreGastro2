const fs = require('fs');

function replace(file, search, replaceStr) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replaceStr);
    fs.writeFileSync(file, content);
}

replace('src/components/auth/employee-selection.component.ts', /error\?\.message/g, '(error as any)?.message');
replace('src/services/operational-auth.service.ts', /locationError\.message/g, '(locationError as any).message');
replace('src/services/operational-auth.service.ts', /error\.message/g, '(error as any).message');
replace('src/components/purchasing/purchasing.component.ts', /error\?\.message/g, '(error as any)?.message');

