import fs from 'fs';

let sql = fs.readFileSync('database.sql', 'utf8');

// 1. Optimize has_access_to_store function
const oldFunc = `CREATE OR REPLACE FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 1. O usuário é o dono da loja (acesso direto)
  IF auth.uid() = target_store_id THEN
    RETURN TRUE;
  END IF;

  -- 2. O usuário tem permissão delegada (tabela unit_permissions)
  IF EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE manager_id = auth.uid() 
    AND store_id = target_store_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;`;

const newFunc = `CREATE OR REPLACE FUNCTION "public"."has_access_to_store"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    auth.uid() = target_store_id 
    OR 
    COALESCE((auth.jwt() -> 'app_metadata' -> 'stores'), '[]'::jsonb) ? target_store_id::text
  );
END;
$$;`;

if (sql.includes(oldFunc)) {
    sql = sql.replace(oldFunc, newFunc);
} else {
    console.log("Could not find exact has_access_to_store to replace, trying regex...");
    const funcRegex = /CREATE OR REPLACE FUNCTION "public"\."has_access_to_store"\([\s\S]*?\$\$;/g;
    sql = sql.replace(funcRegex, newFunc);
}

// 2. We will clean all policies
// We'll write an update SQL that we can use to run on the database and also update the file.
