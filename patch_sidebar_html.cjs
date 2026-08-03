const fs = require('fs');
let content = fs.readFileSync('src/components/sidebar/sidebar.component.html', 'utf8');

content = content.replace(/currentUnit\(\)\?.name/g, 'currentUnitName()');
content = content.replace(/units\(\)/g, 'availableUnits()');
content = content.replace(/currentUnit\(\)\?.id === unit.id/g, 'activeUnitId() === unit.id');

fs.writeFileSync('src/components/sidebar/sidebar.component.html', content);
