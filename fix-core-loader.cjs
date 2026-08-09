const fs = require('fs');

let content = fs.readFileSync('src/services/data-loaders/core-data-loader.service.ts', 'utf8');

// The line is: supabase.from('employees').select('*').eq('user_id', storeId),
content = content.replace(
  /supabase\.from\('employees'\)\.select\('\*'\)/g,
  "supabase.from('employees').select('id, name, role, email, phone, status, store_id, user_id, color, created_at, updated_at, hire_date, birth_date, cpf, base_salary, hourly_rate, employee_type')"
);

fs.writeFileSync('src/services/data-loaders/core-data-loader.service.ts', content);
