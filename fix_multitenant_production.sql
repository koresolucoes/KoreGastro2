-- 1. Otimizar a função de verificação multitenant para usar o JWT (extremamente mais rápido no RLS)
CREATE OR REPLACE FUNCTION public.has_access_to_store(target_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  -- A. O usuário é o dono da loja (acesso direto)
  IF auth.uid() = target_store_id THEN
    RETURN TRUE;
  END IF;

  -- B. O usuário tem permissão delegada sincronizada no JWT (Fast Path para clientes web/mobile)
  IF COALESCE((current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' -> 'stores'), '[]'::jsonb) ? target_store_id::text THEN
    RETURN TRUE;
  END IF;

  -- C. Fallback para processos de backend (Webhooks, cron jobs) onde o JWT pode não estar presente na sessão SQL
  IF EXISTS (
    SELECT 1 FROM unit_permissions 
    WHERE manager_id = auth.uid() 
    AND store_id = target_store_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Consertar as permissões de Escrita (Mutação) para Requisições entre Lojas
-- Permite que a Loja Destino (ex: Cozinha Central) possa Alterar (UPDATE) requisições recebidas
DROP POLICY IF EXISTS "Users can update requisitions of their own restaurant" ON public.requisitions;
CREATE POLICY "Users can update requisitions of their own restaurant" 
ON public.requisitions FOR UPDATE 
USING (
  public.has_access_to_store(user_id) 
  OR (target_unit_id IS NOT NULL AND public.has_access_to_store(target_unit_id))
);

-- Permite que a Loja Destino possa excluir/rejeitar requisições recebidas
DROP POLICY IF EXISTS "Users can delete requisitions of their own restaurant" ON public.requisitions;
CREATE POLICY "Users can delete requisitions of their own restaurant" 
ON public.requisitions FOR DELETE 
USING (
  public.has_access_to_store(user_id) 
  OR (target_unit_id IS NOT NULL AND public.has_access_to_store(target_unit_id))
);

-- 3. Consertar as permissões de Escrita (Mutação) para Itens da Requisição (requisition_items)
-- A Loja Destino agora pode INSERIR, ALTERAR ou DELETAR itens dentro de uma requisição que ela recebeu.
DROP POLICY IF EXISTS "Users can insert requisition items for their own restaurant" ON public.requisition_items;
CREATE POLICY "Users can insert requisition items for their own restaurant" 
ON public.requisition_items FOR INSERT 
WITH CHECK (
  public.has_access_to_store(user_id) 
  OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND public.has_access_to_store(r.target_unit_id))
);

DROP POLICY IF EXISTS "Users can update requisition items of their own restaurant" ON public.requisition_items;
CREATE POLICY "Users can update requisition items of their own restaurant" 
ON public.requisition_items FOR UPDATE 
USING (
  public.has_access_to_store(user_id) 
  OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND public.has_access_to_store(r.target_unit_id))
);

DROP POLICY IF EXISTS "Users can delete requisition items of their own restaurant" ON public.requisition_items;
CREATE POLICY "Users can delete requisition items of their own restaurant" 
ON public.requisition_items FOR DELETE 
USING (
  public.has_access_to_store(user_id) 
  OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND public.has_access_to_store(r.target_unit_id))
);
