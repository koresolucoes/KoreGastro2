import fs from 'fs';

const sql = fs.readFileSync('database.sql', 'utf8');

const tablesWithoutUserId = [];
const tableRegex = /CREATE TABLE IF NOT EXISTS "public"\."([^"]+)" \(([\s\S]*?)\);/g;
let match;
while ((match = tableRegex.exec(sql)) !== null) {
  const tableName = match[1];
  const tableBody = match[2];
  if (!tableBody.includes('"user_id"')) {
    tablesWithoutUserId.push(tableName);
  }
}

console.log('Tables WITHOUT user_id:', tablesWithoutUserId);
