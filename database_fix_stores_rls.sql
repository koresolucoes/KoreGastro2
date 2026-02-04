
-- Habilitar segurança a nível de linha (RLS) na tabela stores
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Users can view their own stores" ON stores;
DROP POLICY IF EXISTS "Users can insert their own stores" ON stores;
DROP POLICY IF EXISTS "Users can update their own stores" ON stores;
DROP POLICY IF EXISTS "Users can delete their own stores" ON stores;

-- 1. Política de SELEÇÃO (Quem pode ver as lojas?)
-- O dono da loja OU quem tem permissão na tabela unit_permissions
CREATE POLICY "Users can view their own stores" 
ON stores FOR SELECT 
USING (
  owner_id = auth.uid() 
  OR 
  EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE unit_permissions.store_id = stores.id 
    AND unit_permissions.manager_id = auth.uid()
  )
);

-- 2. Política de INSERÇÃO (Quem pode criar lojas?)
-- Qualquer usuário autenticado pode criar uma loja onde ele é o dono
CREATE POLICY "Users can insert their own stores" 
ON stores FOR INSERT 
WITH CHECK (owner_id = auth.uid());

-- 3. Política de ATUALIZAÇÃO (Quem pode editar dados da loja?)
-- Apenas o dono
CREATE POLICY "Users can update their own stores" 
ON stores FOR UPDATE 
USING (owner_id = auth.uid());

-- 4. Política de EXCLUSÃO (Quem pode deletar a loja?)
-- Apenas o dono
CREATE POLICY "Users can delete their own stores" 
ON stores FOR DELETE 
USING (owner_id = auth.uid());
