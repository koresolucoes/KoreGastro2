const fs = require('fs');
let svg = fs.readFileSync('public/logo.svg', 'utf8');

let pathsRemoved = 0;
let clean = svg.replace(/<path[^>]*\/>/gs, (match) => {
  const fillMatch = match.match(/fill="#([A-F0-9]{6})"/i);
  if (fillMatch) {
    const hex = fillMatch[1].toUpperCase();
    if (hex.startsWith('F') || hex.startsWith('E') || hex.startsWith('D')) {
      pathsRemoved++;
      return '';
    }
  }
  return match;
});

console.log(`Removed ${pathsRemoved} paths.`);
fs.writeFileSync('public/logo.svg', clean);
