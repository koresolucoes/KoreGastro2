const fs = require('fs');

function fix(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // find the response argument name
    let m = content.match(/export default async function handler\([^,]*, \s*([a-zA-Z0-9_]+)\s*:/);
    if (!m) m = content.match(/export default async function handler\([^,]*, \s*([a-zA-Z0-9_]+)\s*\)/);
    
    let resName = 'res';
    if (m) {
        resName = m[1];
    } else {
        if (content.includes('function handler(request, response)')) resName = 'response';
        if (content.includes('function handler(req, res)')) resName = 'res';
    }

    // Now replace both `res.` and `response.` with `resName.`
    // Be careful not to replace `response.` if `response` is something else, but here it's safe for `.status` and `.json`
    content = content.replace(/\b(res|response)\.status\b/g, resName + '.status');
    content = content.replace(/\b(res|response)\.json\b/g, resName + '.json');
    content = content.replace(/\b(res|response)\.send\b/g, resName + '.send');

    fs.writeFileSync(file, content);
}

const glob = require('glob');
// Just run it on all ts files in api
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
