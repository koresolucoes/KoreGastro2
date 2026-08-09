const fs = require('fs');
let content = fs.readFileSync('api/rh/verificar-pin.ts', 'utf8');

const newLogic = `
        const { employeeId, pin, roleName } = req.body;
        if (!pin) {
            return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '\`pin\` is required.' });
        }

        let employeesToCheck = [];

        if (employeeId) {
            const { data: employee, error: empError } = await supabase
                .from('employees')
                .select('id, name, pin')
                .eq('id', employeeId)
                .eq('user_id', restaurantId)
                .single();
            if (!empError && employee) {
                employeesToCheck.push(employee);
            }
        } else if (roleName) {
            // Find role id
            const { data: roleData } = await supabase
                .from('roles')
                .select('id')
                .eq('name', roleName)
                .eq('user_id', restaurantId)
                .single();
            
            if (roleData) {
                const { data: emps } = await supabase
                    .from('employees')
                    .select('id, name, pin')
                    .eq('role_id', roleData.id)
                    .eq('user_id', restaurantId);
                if (emps) {
                    employeesToCheck = emps;
                }
            }
        } else {
            return res.status(400).json({ error: "Provide employeeId or roleName" });
        }

        if (employeesToCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'Invalid PIN.' });
        }

        let matchedEmployee = null;

        for (const emp of employeesToCheck) {
            if (emp.pin && emp.pin.startsWith('$2')) {
                const isMatch = await bcrypt.compare(pin, emp.pin);
                if (isMatch) {
                    matchedEmployee = emp;
                    break;
                }
            } else {
                if (emp.pin === pin) {
                    matchedEmployee = emp;
                    break;
                }
            }
        }

        if (!matchedEmployee) {
            return res.status(403).json({ success: false, message: 'Invalid PIN.' });
        }

        const employee = matchedEmployee;

        // Emit short-lived operational token (signed with SUPABASE_SERVICE_ROLE_KEY as secret)
        const tokenPayload = { employeeId: employee.id, restaurantId, exp: Date.now() + 1000 * 60 * 60 * 8 }; // 8 hours
        const tokenStr = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const signature = crypto.createHmac('sha256', supabaseKey).update(tokenStr).digest('hex');
        const opToken = \`\${tokenStr}.\${signature}\`;
`;

content = content.replace(
  /const \{ employeeId, pin \} = req\.body;[\s\S]*?const opToken = \`\$\{\w+\}\.\$\{\w+\}\`;/,
  newLogic
);

fs.writeFileSync('api/rh/verificar-pin.ts', content);
