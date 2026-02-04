
-- ==============================================================================
-- FIX: AUTOMATIZAÇÃO DA CRIAÇÃO DE LOJA PARA NOVOS USUÁRIOS
-- Corrige erro 23503 (FK Violation) ao criar cargos/permissões no onboarding
-- ==============================================================================

-- 1. Função que roda quando um novo usuário se cadastra no Auth do Supabase
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- A. Criar a Loja Principal usando o mesmo ID do usuário (padrão legado/compatibilidade)
  INSERT INTO public.stores (id, name, owner_id)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'name', 'Minha Loja') || ' (Principal)', 
    new.id
  )
  ON CONFLICT (id) DO NOTHING;

  -- B. Criar o Perfil da Empresa padrão
  INSERT INTO public.company_profile (user_id, company_name, cnpj)
  VALUES (
    new.id, 
    'Minha Empresa', 
    '00.000.000/0000-00'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- C. Garantir permissão de dono na tabela de permissões (para consultas de RLS)
  INSERT INTO public.unit_permissions (manager_id, store_id, role)
  VALUES (new.id, new.id, 'owner')
  ON CONFLICT (manager_id, store_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Recriar o Trigger (remove se já existir para atualizar a lógica)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- FIX MANUAL PARA USUÁRIOS ATUAIS QUE ESTÃO COM ERRO (BACKFILL)
-- ==============================================================================

-- Cria lojas para usuários que existem no Auth mas não na tabela Stores
INSERT INTO public.stores (id, name, owner_id)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', 'Minha Loja') || ' (Principal)', 
  id
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.stores)
ON CONFLICT DO NOTHING;

-- Garante perfis para esses usuários
INSERT INTO public.company_profile (user_id, company_name, cnpj)
SELECT id, 'Minha Empresa', '00.000.000/0000-00'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.company_profile)
ON CONFLICT DO NOTHING;

-- Garante permissões para esses usuários
INSERT INTO public.unit_permissions (manager_id, store_id, role)
SELECT id, id, 'owner'
FROM auth.users
WHERE id NOT IN (SELECT manager_id FROM public.unit_permissions WHERE role = 'owner')
ON CONFLICT DO NOTHING;
