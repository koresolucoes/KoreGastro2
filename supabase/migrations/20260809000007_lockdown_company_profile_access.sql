-- FASE 6: FECHAR TABELA ORIGINAL
-- Revogar as políticas públicas de SELECT
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."company_profile";
DROP POLICY IF EXISTS "Permitir leitura pública do perfil da empresa" ON "public"."company_profile";

-- (A política Multi-unit Access Select continua permitindo SELECT para usuários autenticados autorizados)
-- No entanto, agora os usuários autenticados deveriam preferencialmente acessar a view company_profile_public 
-- (que não expõe os segredos do backend) ou, se eles tiverem permissão de select direto, 
-- não terão acesso aos tokens que foram migrados e futuramente removidos daqui.
