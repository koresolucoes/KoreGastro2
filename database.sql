
-- 1. Criar a Tabela de Permissões (Associação Usuário -> Loja)
CREATE TABLE IF NOT EXISTS unit_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID REFERENCES auth.users(id) NOT NULL, -- O usuário humano (Gestor)
  store_id UUID REFERENCES auth.users(id) NOT NULL,   -- O usuário "fantasma" (Loja/Dados)
  role TEXT DEFAULT 'admin', -- ex: 'owner', 'manager', 'viewer'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Evita duplicidade de permissão para o mesmo par
  UNIQUE(manager_id, store_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_unit_permissions_manager ON unit_permissions(manager_id);
CREATE INDEX IF NOT EXISTS idx_unit_permissions_store ON unit_permissions(store_id);

-- 2. Habilitar RLS na nova tabela
ALTER TABLE unit_permissions ENABLE ROW LEVEL SECURITY;

-- Política: O usuário pode ver permissões onde ele é o gerente
CREATE POLICY "Users can view their own permissions" 
ON unit_permissions FOR SELECT 
USING (auth.uid() = manager_id);

-- Política: O dono da loja (store_id) pode ver quem tem permissão nela (opcional, para auditoria)
CREATE POLICY "Stores can see their managers" 
ON unit_permissions FOR SELECT 
USING (auth.uid() = store_id);

-- 3. Função Auxiliar para RLS (Importante para performance)
-- Esta função verifica se o usuário atual tem acesso a um determinado store_id
CREATE OR REPLACE FUNCTION public.has_access_to_store(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Acesso direto (o usuário é o dono da loja)
  IF auth.uid() = target_store_id THEN
    RETURN TRUE;
  END IF;

  -- 2. Acesso delegado (está na tabela de permissões)
  IF EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE manager_id = auth.uid() 
    AND store_id = target_store_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Exemplo de Atualização de Políticas RLS para as tabelas existentes
-- Você deve aplicar uma lógica similar a todas as tabelas (orders, ingredients, etc.)
-- O exemplo abaixo altera a tabela 'orders'. Repita para as outras se necessário.

-- DROP POLICY IF EXISTS "Users can view orders of their own restaurant" ON orders;
-- CREATE POLICY "Multi-unit access for orders" 
-- ON orders FOR SELECT 
-- USING (public.has_access_to_store(user_id));

-- NOTA: Como solicitado para "não modificar muito", o sistema funcionará via frontend
-- filtrando pelo ID correto. No entanto, para segurança real, você deve atualizar
-- as políticas RLS de todas as tabelas usando a função `has_access_to_store(user_id)`.
