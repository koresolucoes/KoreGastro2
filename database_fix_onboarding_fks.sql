
-- ==============================================================================
-- FIX: CORREÇÃO DE CHAVES ESTRANGEIRAS PARA RH E ONBOARDING (IDEMPOTENTE)
-- Corrige erro: violates foreign key constraint "role_permissions_user_id_fkey"
-- Corrige erro: constraint "roles_store_id_fkey" already exists
-- ==============================================================================

BEGIN;

-- 1. Garantir que a tabela STORES tenha o registro da loja para todos os usuários
-- (Isso previne o erro se a loja ainda não tiver sido criada pelo trigger)
INSERT INTO public.stores (id, name, owner_id)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', 'Minha Loja') || ' (Principal)', 
  id
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.stores)
ON CONFLICT (id) DO NOTHING;

-- 2. Corrigir tabela ROLES (Cargos)
-- Remove a constraint antiga (se existir)
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_user_id_fkey;
-- Remove a constraint nova (se já existir, para evitar erro de duplicidade)
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_store_id_fkey;

-- Adiciona a nova constraint apontando para public.stores
ALTER TABLE public.roles
  ADD CONSTRAINT roles_store_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- 3. Corrigir tabela ROLE_PERMISSIONS (Permissões)
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_user_id_fkey;
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_store_id_fkey;

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_store_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- 4. Corrigir tabela EMPLOYEES (Funcionários)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_user_id_fkey;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_store_id_fkey;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_store_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.stores(id) ON DELETE CASCADE;

COMMIT;
