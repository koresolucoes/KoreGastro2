import fs from 'fs';
const file = 'src/components/pos/table-layout/table-layout.component.ts';
let code = fs.readFileSync(file, 'utf8');

// Find the saveLayout function and rewrite it
code = code.replace(
  /async saveLayout\(\) \{\n\s*const tablesToSave = this.localTables\(\).map\(\(table, index\) => \{\n\s*return \{\n\s*\.\.\.table,\n\s*order_index: index,\n\s*tenant_id: 'default_tenant',\n\s*\};\n\s*\}\);\n\s*if \(tablesToSave\.length > 0\) \{\n\s*const res = await this.posDataService.upsertTables\(tablesToSave\);\n\s*if \(res.error\) console.error\('Error upserting tables:', res.error\);\n\s*\}/g,
  `async saveLayout() {
    const tablesToSave = this.localTables().map((table) => {
        // Strip out unknown properties if any, or just use the table
        return table;
    });
    if (tablesToSave.length > 0) {
        const res = await this.posDataService.upsertTables(tablesToSave);
        if (res.error) console.error('Error upserting tables:', res.error);
    }`
);

fs.writeFileSync(file, code);
