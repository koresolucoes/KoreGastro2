const fs = require('fs');

let content = fs.readFileSync('api/rh/verificar-pin.ts', 'utf8');

// Add bcrypt import
content = content.replace(
  "import { createClient } from '@supabase/supabase-js';",
  "import { createClient } from '@supabase/supabase-js';\nimport bcrypt from 'bcryptjs';\nimport crypto from 'crypto';"
);

// Replace verification logic
const verifyLogic = `
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('id, name, pin')
            .eq('id', employeeId)
            .eq('user_id', restaurantId)
            .single();
        
        if (empError || !employee) {
            return res.status(403).json({ success: false, message: 'Invalid employeeId or PIN.' });
        }

        let isMatch = false;
        if (employee.pin && employee.pin.startsWith('$2')) {
            isMatch = await bcrypt.compare(pin, employee.pin);
        } else {
            // Legacy plain text
            isMatch = employee.pin === pin;
            // Optionally auto-migrate here (omitted for brevity)
        }

        if (!isMatch) {
            return res.status(403).json({ success: false, message: 'Invalid employeeId or PIN.' });
        }

        // Emit short-lived operational token (signed with SUPABASE_SERVICE_ROLE_KEY as secret)
        const tokenPayload = { employeeId: employee.id, restaurantId, exp: Date.now() + 1000 * 60 * 60 * 8 }; // 8 hours
        const tokenStr = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const signature = crypto.createHmac('sha256', supabaseKey).update(tokenStr).digest('hex');
        const opToken = \`\${tokenStr}.\${signature}\`;
`;

content = content.replace(
  /const \{ data: employee, error: empError \}[\s\S]*?if \(empError \|\| !employee \|\| employee\.pin !== pin\) \{[\s\S]*?return res\.status\(403\)\.json\(\{ success: false, message: 'Invalid employeeId or PIN\.' \}\);[\s\S]*?\}/,
  verifyLogic
);

// Return the opToken
content = content.replace(
  /return res\.status\(200\)\.json\(\{/,
  'return res.status(200).json({\n            opToken,'
);

fs.writeFileSync('api/rh/verificar-pin.ts', content);
