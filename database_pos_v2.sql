
-- ==============================================================================
-- MIGRATION: POS V2 & COMMANDS SUPPORT
-- ==============================================================================

-- 1. Alterar tabela ORDERS para suportar Comandas (Sem mesa fixa)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS command_number INTEGER, -- Número do cartão/comanda física
ADD COLUMN IF NOT EXISTS tab_name TEXT;          -- Nome de identificação rápida (ex: "Pedro")

-- Criar índice para busca rápida de comandas
CREATE INDEX IF NOT EXISTS idx_orders_command_number ON orders(command_number);
CREATE INDEX IF NOT EXISTS idx_orders_tab_name ON orders(tab_name);

-- 2. Garantir colunas de Auditoria (Caso script anterior não tenha rodado)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS closed_by_employee_id UUID REFERENCES employees(id);

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS added_by_employee_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS authorized_by_employee_id UUID REFERENCES employees(id);

-- 3. Atualizar a view de performance ou relatórios se necessário (automático no Supabase)
-- Apenas garantindo que o RLS permita acesso a essas novas colunas
-- (As políticas existentes "select *" já cobrem novas colunas)
