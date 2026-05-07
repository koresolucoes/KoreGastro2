const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');
content = content.replace("foreignKeyName: menu_categories_menu_id_fkey", 'foreignKeyName: "menu_categories_menu_id_fkey"');
content = content.replace("columns: [menu_id]", 'columns: ["menu_id"]');
content = content.replace("referencedRelation: menus", 'referencedRelation: "menus"');
content = content.replace("referencedColumns: [id]", 'referencedColumns: ["id"]');
fs.writeFileSync('src/types.ts', content);
