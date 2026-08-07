const fs = require('fs');
let file = 'src/components/purchasing/purchasing.component.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/'id' \| 'created_at' \| 'user_id' \| 'ingredient_categories' \| 'suppliers'/g, "'id' | 'created_at' | 'user_id' | 'ingredient_categories' | 'suppliers' | 'version' | 'last_updated_at'");
fs.writeFileSync(file, content);
