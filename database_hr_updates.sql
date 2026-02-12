
-- Tabela para Ajustes de Folha (Bônus/Descontos)
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL, -- Formato "MM/YYYY" para vincular ao mês da folha
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL, -- Valor positivo (bônus) ou negativo (desconto)
  type TEXT CHECK (type IN ('BONUS', 'DEDUCTION')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_period ON payroll_adjustments(user_id, period);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee ON payroll_adjustments(employee_id);

-- RLS
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Multi-unit Access Select" ON payroll_adjustments
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON payroll_adjustments
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Update" ON payroll_adjustments
FOR UPDATE USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Delete" ON payroll_adjustments
FOR DELETE USING ( public.has_access_to_store(user_id) );
