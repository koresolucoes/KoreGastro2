import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('employee bootstrap projection matches the real schema and never exposes PIN', () => {
  const loader = read('src/services/data-loaders/core-data-loader.service.ts');
  const schema = read('supabase/migrations/20260808000000_system_tables.sql');
  const projectionMatch = loader.match(/EMPLOYEE_BOOTSTRAP_COLUMNS\s*=\s*'([^']+)'/);
  assert.ok(projectionMatch, 'employee projection must remain an auditable string literal');

  const tableMatch = schema.match(/CREATE TABLE IF NOT EXISTS "public"\."employees" \(([\s\S]*?)\n\);/);
  assert.ok(tableMatch, 'employees table definition was not found');
  const schemaColumns = new Set(
    [...tableMatch[1].matchAll(/^\s*"([^"]+)"/gm)].map((match) => match[1])
  );
  const selectedColumns = projectionMatch[1].split(',').map((column) => column.trim());

  for (const column of selectedColumns) {
    assert.ok(schemaColumns.has(column), `bootstrap selects missing employees column: ${column}`);
  }
  for (const sensitiveOrInvalid of ['pin', 'email', 'status', 'store_id', 'color', 'base_salary', 'hourly_rate', 'employee_type']) {
    assert.ok(!selectedColumns.includes(sensitiveOrInvalid), `bootstrap must not select ${sensitiveOrInvalid}`);
  }
  assert.match(loader, /\.is\('deleted_at', null\)/);
});

test('operational PIN login uses a Supabase session without reading integration secrets', () => {
  const authService = read('src/services/operational-auth.service.ts');
  assert.match(authService, /supabase\.auth\.getSession\(\)/);
  assert.match(authService, /Authorization.*session\.access_token/s);
  assert.doesNotMatch(authService, /from\(['"]store_integration_credentials['"]\)/);
});

test('PIN endpoints enforce tenant scope, hashing and rate limits', () => {
  const verifier = read('api/rh/verificar-pin.ts');
  const clock = read('api/rh/ponto/bater-ponto.ts');

  assert.match(verifier, /supabase\.auth\.getUser\(token\)/);
  assert.match(verifier, /validateApiKey\(req\)/);
  assert.match(verifier, /accountCanAccessStore/);
  assert.match(verifier, /bcrypt\.compare\(pin, employee\.pin\)/);
  assert.match(verifier, /checkRateLimit\([^;]+, 12, 60\)/s);
  assert.match(verifier, /\.eq\('user_id', auth\.restaurantId\)/);
  assert.match(verifier, /\.is\('deleted_at', null\)/);

  assert.match(clock, /validateApiKey\(req\)/);
  assert.match(clock, /bcrypt\.compare\(pin, employee\.pin\)/);
  assert.match(clock, /checkRateLimit\([^;]+, 12, 60\)/s);
  assert.match(clock, /\.is\('deleted_at', null\)/);
});

test('credential migration is tenant-aware and keeps API-key stores synchronized', () => {
  const migration = read('supabase/migrations/20260810000000_fix_backend_auth_contract.sql');
  assert.match(migration, /regenerate_external_api_key\(p_store_id uuid DEFAULT NULL\)/);
  assert.match(migration, /has_access_to_store\(target_store_id\)/);
  assert.match(migration, /INSERT INTO public\.store_integration_credentials/);
  assert.match(migration, /UPDATE public\.company_profile[\s\S]+external_api_key = new_api_key/);
  assert.match(migration, /update_store_credentials\([\s\S]+p_store_id uuid,[\s\S]+p_credentials jsonb/);
  assert.match(migration, /extensions\.crypt\(pin, extensions\.gen_salt\('bf', 10\)\)/);
  assert.match(migration, /CREATE TRIGGER employees_hash_pin_before_write/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF pin ON public\.employees/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.regenerate_external_api_key/);
});

test('documented v2 aliases resolve before the Angular catch-all', () => {
  const config = JSON.parse(read('vercel.json'));
  const rewrites = config.rewrites;
  const catchAllIndex = rewrites.findIndex((rewrite) => rewrite.source === '/(.*)');
  for (const source of [
    '/api/v2/rh/:path*',
    '/api/v2/whatsapp/:path*',
    '/api/v2/public-stock',
    '/api/v2/public-table-occupied',
    '/api/v2/delivery-location'
  ]) {
    const index = rewrites.findIndex((rewrite) => rewrite.source === source);
    assert.ok(index >= 0 && index < catchAllIndex, `${source} must resolve before the SPA catch-all`);
  }
});

test('public API implementation and OpenAPI document use the same contracts', () => {
  const swagger = JSON.parse(read('public/docs/swagger.json'));
  const publicStock = read('api/public-stock.ts');
  const publicTable = read('api/public-table-occupied.ts');

  assert.ok(swagger.paths['/public-stock'].get);
  assert.ok(swagger.paths['/public-table-occupied'].get);
  assert.ok(swagger.paths['/public-table-occupied'].post);
  assert.ok(swagger.paths['/delivery-location'].post);
  assert.equal(swagger.paths['/delivery-location'].get, undefined);
  assert.match(publicStock, /req\.query\.restaurantId \|\| req\.query\.userId/);
  assert.match(publicTable, /req\.method === 'GET'/);
  assert.match(publicTable, /req\.method !== 'GET' && req\.method !== 'POST'/);
});

test('credential endpoint checks store access before service-role reads', () => {
  const endpoint = read('api/v2/credentials.ts');
  const accessCheckIndex = endpoint.indexOf('accountCanAccessStore(user.id, storeId)');
  const credentialReadIndex = endpoint.indexOf("from('store_integration_credentials')");
  assert.ok(accessCheckIndex >= 0 && credentialReadIndex > accessCheckIndex);
  assert.match(endpoint, /\.eq\('manager_id', accountId\)/);
  assert.match(endpoint, /Cache-Control', 'no-store/);
});

test('Redis rate limiter honors per-endpoint limits', () => {
  const redis = read('api/utils/redis.ts');
  assert.match(redis, /limiterKey = `\$\{maxRequests\}:\$\{windowSeconds\}`/);
  assert.match(redis, /Ratelimit\.slidingWindow\(maxRequests/);
});
