const fs = require('fs');
let content = fs.readFileSync('src/components/sidebar/sidebar.component.ts', 'utf8');

content = content.replace(/currentUnit = this.unitContextService.currentUnit;/g, 'currentUnitName = this.unitContextService.activeUnitName;\n  activeUnitId = this.unitContextService.activeUnitId;');
content = content.replace(/units = this.unitContextService.units;/g, 'availableUnits = this.unitContextService.availableUnits;');

fs.writeFileSync('src/components/sidebar/sidebar.component.ts', content);
