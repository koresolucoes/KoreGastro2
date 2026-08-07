const fs = require('fs');

function fix(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Fix all function signatures that still have `request: VercelRequest, response: VercelResponse` etc
    content = content.replace(/request\s*:\s*VercelRequest/g, 'req: VercelRequest');
    content = content.replace(/response\s*:\s*VercelResponse/g, 'res: VercelResponse');
    content = content.replace(/request\s*:\s*any/g, 'req: any');
    content = content.replace(/response\s*:\s*any/g, 'res: any');
    content = content.replace(/function handler\(request,/g, 'function handler(req,');
    content = content.replace(/,\s*response\)/g, ', res)');
    content = content.replace(/,\s*response,/g, ', res,');

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
