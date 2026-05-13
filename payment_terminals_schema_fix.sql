-- Adicionar user_id à tabela payment_terminals
ALTER TABLE public.payment_terminals
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Limpar dados se necessário ou atualizar para o user_id atual se quiser no banco (manualmente)
-- Para desenvolvimento podemos apenas dropar e recriar.
-- Mas adicionar a coluna já deve servir:

-- Atualizar RLS para filtar pelo user_id corretamente (SEGURANÇA RECOMENDADA)
DROP POLICY IF EXISTS "Permitir leitura de terminais para usuários autenticados" ON public.payment_terminals;
CREATE POLICY "Permitir leitura de terminais para usuários do tenant" 
    ON public.payment_terminals 
    FOR SELECT 
    TO authenticated 
    USING (user_id = auth.uid() OR user_id IN (SELECT user_id FROM employees WHERE id::text = auth.uid()::text));
    
DROP POLICY IF EXISTS "Permitir inserção de terminais para administradores" ON public.payment_terminals;
CREATE POLICY "Permitir inserção de terminais para dono" 
    ON public.payment_terminals 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Permitir atualização de terminais para administradores" ON public.payment_terminals;
CREATE POLICY "Permitir atualização de terminais para dono" 
    ON public.payment_terminals 
    FOR UPDATE
    TO authenticated 
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Permitir deleção de terminais para administradores" ON public.payment_terminals;
CREATE POLICY "Permitir deleção de terminais para dono" 
    ON public.payment_terminals 
    FOR DELETE
    TO authenticated 
    USING (user_id = auth.uid());
