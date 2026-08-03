const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/dashboard.component.ts', 'utf8');

const target = `  viewMode = signal<'grid' | 'list'>('grid');`;
const replacement = `  viewMode = signal<'grid' | 'list'>('grid');
  selectedCategoryForModal = signal<LaunchpadCategory | null>(null);`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/dashboard/dashboard.component.ts', content);
