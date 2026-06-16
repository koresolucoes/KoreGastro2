-- Arquivo de migração para Fase 1: Autoatendimento / Table Order

-- Adiciona a coluna session_token na tabela orders para permitir acessos seguros via QR Code.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();

-- Você pode também criar um índice se quiser melhorar o tempo de pesquisa pelo session_token
CREATE INDEX IF NOT EXISTS idx_orders_session_token ON public.orders(session_token);
