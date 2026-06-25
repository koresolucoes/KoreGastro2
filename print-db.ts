console.log(Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('DB') || k.includes('POSTGRES')));
