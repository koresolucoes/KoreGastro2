const fs = require('fs');

let content = fs.readFileSync('src/services/operational-auth.service.ts', 'utf8');

const verifyPinMethod = `
  async verifyPin(employeeId: string, pin: string, storeId: string): Promise<{ success: boolean; employee?: Employee, message?: string, opToken?: string }> {
      try {
          const { data: creds } = await supabase.from('store_integration_credentials').select('external_api_key').eq('store_id', storeId).single();
          if (!creds || !creds.external_api_key) return { success: false, message: 'Chave de API não configurada' };

          const res = await fetch('/api/rh/verificar-pin', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': \`Bearer \${creds.external_api_key}\`
              },
              body: JSON.stringify({ employeeId, pin, restaurantId: storeId })
          });
          const data = await res.json();
          if (res.ok && data.success) {
              return { success: true, employee: data.employee, opToken: data.opToken };
          }
          return { success: false, message: data.message || 'PIN incorreto' };
      } catch (e: any) {
          return { success: false, message: e.message || 'Erro na comunicação' };
      }
  }

  hasPermission(url: string): boolean {
`;

content = content.replace(/hasPermission\(url: string\): boolean \{/, verifyPinMethod);

fs.writeFileSync('src/services/operational-auth.service.ts', content);
