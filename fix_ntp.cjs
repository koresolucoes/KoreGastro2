const fs = require('fs');

function fixFile(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace ntpService.now() with new Date() to quickly fix the missing method
    content = content.replace(/this\.ntpService\.now\(\)/g, 'new Date()');
    
    fs.writeFileSync(file, content);
    console.log("Fixed " + file);
}

fixFile('src/services/inventory-data.service.ts');
