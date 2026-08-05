import fs from 'fs';
const file = 'src/components/pos/table-layout/table-layout.component.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  /const tablesToSave = this.localTables\(\);\n\s*if \(tablesToSave.length > 0\) \{\n\s*await this.posDataService.upsertTables\(tablesToSave\);\n\s*\}/g,
  `const tablesToSave = this.localTables();
    if (tablesToSave.length > 0) {
        const res = await this.posDataService.upsertTables(tablesToSave);
        if (res.error) console.error('Error upserting tables:', res.error);
    }`
);
code = code.replace(
  /await this.posDataService.deleteTable\(table.id\);/g,
  `const res = await this.posDataService.deleteTable(table.id); if (res.error) console.error('Error deleting table:', res.error);`
)
fs.writeFileSync(file, code);
