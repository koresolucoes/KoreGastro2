const fs = require('fs');

const lintOutput = fs.readFileSync('lint_errors.txt', 'utf8');
const lines = lintOutput.split('\n');

const filesToFix = new Set();
lines.forEach(line => {
    if (line.includes("Cannot find name 'res'")) {
        const file = line.split('(')[0];
        filesToFix.add(file);
    }
});

filesToFix.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\bres\.status/g, 'response.status');
    fs.writeFileSync(file, content);
    console.log("Fixed " + file);
});
