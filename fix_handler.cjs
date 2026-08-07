const fs = require('fs');
const glob = require('glob');

function fix(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Convert any `export default async function handler(request: ..., response: ...)` to `export default async function handler(req: any, res: any)`
    content = content.replace(/export default async function handler\([^)]+\)/g, 'export default async function handler(req: any, res: any)');
    
    // Replace all `response.` with `res.` and `request.` with `req.`
    content = content.replace(/\bresponse\./g, 'res.');
    content = content.replace(/\brequest\./g, 'req.');
    
    fs.writeFileSync(file, content);
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = require('path').join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) walkDir(dirPath);
        else if (dirPath.endsWith('.ts')) fix(dirPath);
    });
}
walkDir('api');
console.log("Done");
