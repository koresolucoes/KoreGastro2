const fs = require('fs');

let content = fs.readFileSync('api/rh/ponto/bater-ponto.ts', 'utf8');

// Add bcrypt import
content = content.replace(
  "import { createClient } from '@supabase/supabase-js';",
  "import { createClient } from '@supabase/supabase-js';\nimport bcrypt from 'bcryptjs';"
);

// Replace verification logic
const verifyLogic = `
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, name, role, pin')
      .eq('id', employeeId)
      .eq('user_id', restaurantId)
      .single();

    if (employeeError || !employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    let isMatch = false;
    if (employee.pin && employee.pin.startsWith('$2')) {
        isMatch = await bcrypt.compare(pin, employee.pin);
    } else {
        isMatch = employee.pin === pin;
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'PIN incorreto.' });
    }
`;

content = content.replace(
  /const \{ data: employee, error: employeeError \}[\s\S]*?if \(!employee \|\| employee\.pin !== pin\) \{\n\s*return res\.status\(401\)\.json\(\{ error: 'PIN incorreto\.' \}\);\n\s*\}/,
  verifyLogic
);

fs.writeFileSync('api/rh/ponto/bater-ponto.ts', content);
