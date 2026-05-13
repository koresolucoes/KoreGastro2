-- SQL para criar a tabela de terminais de pagamento (Maquininhas) no Supabase

CREATE TABLE IF NOT EXISTS public.payment_terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('cielo_lio', 'stone', 'pagseguro', 'mercado_pago')),
    identifier TEXT NOT NULL,
    credentials JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (Exemplo: permitir que usuários autenticados leiam e modifiquem)
CREATE POLICY "Permitir leitura de terminais para usuários autenticados" 
    ON public.payment_terminals 
    FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Permitir inserção de terminais para administradores" 
    ON public.payment_terminals 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (true); -- Adicione sua lógica de admin aqui se necessário

CREATE POLICY "Permitir atualização de terminais para administradores" 
    ON public.payment_terminals 
    FOR UPDATE
    TO authenticated 
    USING (true);

CREATE POLICY "Permitir deleção de terminais para administradores" 
    ON public.payment_terminals 
    FOR DELETE
    TO authenticated 
    USING (true);

-- Trigger para atualizar o updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.payment_terminals;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.payment_terminals
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Comentários da tabela e colunas (opcional mas recomendado)
COMMENT ON TABLE public.payment_terminals IS 'Armazena a configuração das maquininhas de cartão físicas integradas (ex: Cielo LIO).';
COMMENT ON COLUMN public.payment_terminals.name IS 'Nome amigável da máquina (ex: Caixa Principal).';
COMMENT ON COLUMN public.payment_terminals.provider IS 'Fornecedor da máquina (ex: cielo_lio).';
COMMENT ON COLUMN public.payment_terminals.identifier IS 'Identificador único na plataforma do fornecedor (ex: Número Lógico ou Device ID).';
COMMENT ON COLUMN public.payment_terminals.credentials IS 'Credenciais de API necessárias para comunicar com este terminal (ex: Client-Id, Access-Token).';
