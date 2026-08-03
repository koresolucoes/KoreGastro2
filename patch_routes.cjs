const fs = require('fs');
let content = fs.readFileSync('src/app.routes.ts', 'utf8');

content = content.replace(
`  { 
    path: 'home', 
    loadComponent: () => import('./components/launchpad/launchpad.component').then(m => m.LaunchpadComponent), 
    canActivate: [roleGuard] 
  },`,
`  { 
    path: 'home', 
    redirectTo: 'dashboard', 
    pathMatch: 'full' 
  },`);

content = content.replace(
`  { 
    path: '', 
    redirectTo: 'home', 
    pathMatch: 'full' 
  },`,
`  { 
    path: '', 
    redirectTo: 'dashboard', 
    pathMatch: 'full' 
  },`);

fs.writeFileSync('src/app.routes.ts', content);
