const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/dashboard.component.ts', 'utf8');

const importReplacement = `import { InventoryStateService } from '../../services/inventory-state.service';
import { Order } from '../../models/db.models';
import { DashboardVisualizationsComponent } from './dashboard-visualizations.component';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoService } from '../../services/demo.service';

export interface LaunchpadItem {
  name: string;
  path: string;
  icon: string;
  color: string;
  description: string;
}

export interface LaunchpadCategory {
  id: string;
  title: string;
  icon: string;
  items: LaunchpadItem[];
}
`;

content = content.replace(`import { InventoryStateService } from '../../services/inventory-state.service';
import { Order } from '../../models/db.models';
import { DashboardVisualizationsComponent } from './dashboard-visualizations.component';`, importReplacement);

fs.writeFileSync('src/components/dashboard/dashboard.component.ts', content);
