
-- ==============================================================================
-- FIX: ADICIONAR COLUNA FALTANTE 'CREATED_AT' EM TRANSACTIONS
-- Corrige o erro: column "created_at" of relation "transactions" does not exist
-- ==============================================================================

-- 1. Adicionar a coluna created_at se ela não existir
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Atualizar registros antigos que podem estar com created_at nulo
-- Usa a coluna 'date' (legada) como base para manter o histórico correto
UPDATE transactions 
SET created_at = date 
WHERE created_at IS NULL;

-- 3. Adicionar índice para melhorar a performance de relatórios futuros
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- 4. Confirmação
SELECT 'Correção aplicada com sucesso. A tabela transactions agora possui created_at.' as result;
