-- Execute este script no SQL Editor do Supabase para criar a tabela de logs imutáveis e configurar a segurança.

-- 1. Criar a tabela system_logs
CREATE TABLE public.system_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- 3. Política para Inserir (Insert): Apenas usuários autenticados da loja podem inserir logs
CREATE POLICY "Users can insert their own system logs"
    ON public.system_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 4. Política para Ler (Select): Apenas usuários autenticados da loja podem ler
CREATE POLICY "Users can view their own system logs"
    ON public.system_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- IMPORTANTE: Não há políticas para UPDATE ou DELETE. 
-- Isso torna a tabela imutável para usuários e aplicações comuns via API do Supabase!
