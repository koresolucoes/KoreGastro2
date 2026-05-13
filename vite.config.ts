import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => {
  // Pick up variables from process.env (Vercel)
  const supabaseUrl = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'] || '';
  const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'] || '';
  const geminiApiKey = process.env['GEMINI_API_KEY'] || process.env['VITE_GEMINI_API_KEY'] || '';
  const cieloMerchantId = process.env['CIELO_MERCHANT_ID'] || process.env['VITE_CIELO_MERCHANT_ID'] || '';
  const cieloMerchantKey = process.env['CIELO_MERCHANT_KEY'] || process.env['VITE_CIELO_MERCHANT_KEY'] || '';

  if (mode === 'production') {
    console.log('--- Build Environment Check ---');
    console.log('SUPABASE_URL:', supabaseUrl ? 'Configured' : 'MISSING');
    console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Configured' : 'MISSING');
    console.log('GEMINI_API_KEY:', geminiApiKey ? 'Configured' : 'MISSING');
    console.log('CIELO_MERCHANT_ID:', cieloMerchantId ? 'Configured' : 'MISSING');
    console.log('CIELO_MERCHANT_KEY:', cieloMerchantKey ? 'Configured' : 'MISSING');
    console.log('-------------------------------');
  }

  return {
    plugins: [angular({ tsconfig: './tsconfig.json' })],
    define: {
      SUPABASE_URL: JSON.stringify(supabaseUrl),
      SUPABASE_ANON_KEY: JSON.stringify(supabaseAnonKey),
      GEMINI_API_KEY: JSON.stringify(geminiApiKey),
      CIELO_MERCHANT_ID: JSON.stringify(cieloMerchantId),
      CIELO_MERCHANT_KEY: JSON.stringify(cieloMerchantKey),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api/cielo': {
          target: 'https://apisandbox.cieloecommerce.cielo.com.br',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/cielo/, '')
        }
      }
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});
