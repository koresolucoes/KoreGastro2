import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { join } from 'path';
import { existsSync } from 'fs';
import { parse } from 'url';

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
    plugins: [
      angular({ tsconfig: './tsconfig.json' }),
      {
        name: 'api-server-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url || '';
            const parsedUrl = parse(url);
            const pathname = parsedUrl.pathname || '';

            // Intercept standard API endpoints except Cielo which is proxy-mapped
            if (pathname.startsWith('/api') && !pathname.startsWith('/api/cielo')) {
              let relativePath = pathname;
              if (relativePath.endsWith('/')) {
                relativePath = relativePath.slice(0, -1);
              }

              const cleanRelativePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

              // Resolve TS or JS files
              let filePath = join(server.config.root, cleanRelativePath + '.ts');
              if (!existsSync(filePath)) {
                filePath = join(server.config.root, cleanRelativePath + '.js');
              }
              if (!existsSync(filePath)) {
                filePath = join(server.config.root, cleanRelativePath, 'index.ts');
              }
              if (!existsSync(filePath)) {
                filePath = join(server.config.root, cleanRelativePath, 'index.js');
              }

              // Route wildcards for HR
              if (!existsSync(filePath) && pathname.startsWith('/api/rh/')) {
                const catchAll = join(server.config.root, 'api/rh/[...slug].ts');
                if (existsSync(catchAll)) {
                  filePath = catchAll;
                }
              }

              if (existsSync(filePath)) {
                console.log(`[API Dev Server] Intercepted path: ${pathname}, resolved file: ${filePath}, exists: true`);
                try {
                  // Propagate credentials for supabase client and other services
                  process.env.SUPABASE_URL = process.env.SUPABASE_URL || supabaseUrl;
                  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || supabaseAnonKey;
                  // Service Role Key is handled securely in backend process env
                  
                  // Load the API handler dynamically with Vite compile mechanisms
                  const module = await server.ssrLoadModule(filePath);
                  let handler = module.default || module;
                  
                  // Handle cases where the default export is nested under another default property
                  if (handler && typeof handler !== 'function' && typeof handler.default === 'function') {
                    handler = handler.default;
                  }

                  if (typeof handler === 'function') {
                    // Extract payload
                    const body = await new Promise((resolve) => {
                      let data = '';
                      req.on('data', chunk => { data += chunk; });
                      req.on('end', () => {
                        if (!data) return resolve(undefined);
                        try {
                          if (req.headers['content-type']?.includes('application/json')) {
                            resolve(JSON.parse(data));
                          } else {
                            resolve(data);
                          }
                        } catch {
                          resolve(data);
                        }
                      });
                    });

                    // Parse parameters
                    const query: Record<string, string> = {};
                    if (parsedUrl.query) {
                      const searchParams = new URLSearchParams(parsedUrl.query);
                      searchParams.forEach((val, key) => {
                        query[key] = val;
                      });
                    }

                    const vercelReq = Object.assign(req, {
                      query,
                      body,
                      cookies: {}
                    });

                    const vercelRes = Object.assign(res, {
                      status(code: number) {
                        res.statusCode = code;
                        return vercelRes;
                      },
                      json(jsonBody: any) {
                        if (!res.headersSent) {
                          res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        }
                        res.end(JSON.stringify(jsonBody));
                        return vercelRes;
                      },
                      send(bodyData: any) {
                        res.end(bodyData);
                        return vercelRes;
                      }
                    });

                    await handler(vercelReq, vercelRes);
                    return;
                  } else {
                    console.error(`[API Dev Server] Loaded module for ${pathname} but it is not a function. Export keys:`, Object.keys(module), `typeof handler is ${typeof handler}`);
                  }
                } catch (error: any) {
                  console.error(`Error processing API route ${pathname}:`, error);
                  if (!res.headersSent) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Internal Server Error', message: error.message }));
                  }
                  return;
                }
              } else {
                console.warn(`[API Dev Server] Route handler not found: ${pathname} resolved as: ${filePath}`);
              }
            }
            next();
          });
        }
      }
    ],
    define: {
      SUPABASE_URL: JSON.stringify(supabaseUrl),
      SUPABASE_ANON_KEY: JSON.stringify(supabaseAnonKey),
      GEMINI_API_KEY: JSON.stringify(geminiApiKey),
      CIELO_MERCHANT_ID: JSON.stringify(cieloMerchantId),
      CIELO_MERCHANT_KEY: JSON.stringify(cieloMerchantKey)
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
