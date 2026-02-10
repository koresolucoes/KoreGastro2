
-- Adiciona colunas para registrar a produção real e detalhes de finalização
ALTER TABLE production_tasks
ADD COLUMN IF NOT EXISTS quantity_produced NUMERIC, -- Quanto foi realmente produzido
ADD COLUMN IF NOT EXISTS completion_notes TEXT, -- Observações da produção (ex: "Rendeu menos devido à evaporação")
ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMP WITH TIME ZONE; -- Validade do lote produzido
