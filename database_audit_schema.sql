
-- ==============================================================================
-- MIGRATION: CHEFOS AUDIT & TRACEABILITY (PHASE 2)
-- Objetivo: Adicionar rastreabilidade de usuário (quem fez o quê) em todas as tabelas críticas.
-- ==============================================================================

-- 1. TABELA DE LOGS DE ESTOQUE (Imutável)
CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES stores(id) NOT NULL, -- Loja
  ingredient_id UUID REFERENCES ingredients(id) NOT NULL,
  employee_id UUID REFERENCES employees(id), -- Quem fez a ação (pode ser nulo se for sistema)
  quantity_change NUMERIC NOT NULL, -- Positivo ou Negativo
  previous_balance NUMERIC, -- Snapshot do estoque antes
  new_balance NUMERIC, -- Snapshot do estoque depois
  reason TEXT NOT NULL, -- Ex: "Venda #123", "Quebra", "Compra #99"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance de relatórios
CREATE INDEX IF NOT EXISTS idx_inventory_logs_ingredient ON inventory_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_date ON inventory_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_employee ON inventory_logs(employee_id);

-- RLS para Logs
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Multi-unit Access Select" ON inventory_logs
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON inventory_logs
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );


-- 2. AUDITORIA EM PEDIDOS (ORDERS)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS closed_by_employee_id UUID REFERENCES employees(id);


-- 3. AUDITORIA EM ITENS DO PEDIDO (ORDER_ITEMS)
-- Já adicionamos cancelled_by na fase anterior
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS added_by_employee_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS authorized_by_employee_id UUID REFERENCES employees(id); -- Para descontos/estornos


-- 4. AUDITORIA EM COMPRAS (PURCHASE_ORDERS)
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS received_by_employee_id UUID REFERENCES employees(id);


-- 5. AUDITORIA EM PORCIONAMENTO (PORTIONING_EVENTS)
-- Garantir que a coluna já existe (o schema original já tinha, mas reforçamos)
-- Se não existir, o comando abaixo cria.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='portioning_events' AND column_name='employee_id') THEN
        ALTER TABLE portioning_events ADD COLUMN employee_id UUID REFERENCES employees(id);
    END IF;
END $$;


-- 6. AUDITORIA EM TRANSAÇÕES FINANCEIRAS (TRANSACTIONS)
-- Garantir que a coluna employee_id está devidamente referenciada
-- (Já existe no modelo, apenas validação de integridade futura)
