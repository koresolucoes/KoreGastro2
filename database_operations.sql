-- ==============================================================================
-- MIGRATION: CHECKLISTS & CONTROLE DE TEMPERATURA
-- ==============================================================================

-- 1. CHECKLIST TEMPLATES (Tarefas configuradas pelo gestor)
CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  section TEXT NOT NULL, -- Ex: 'Cozinha', 'Bar', 'Salão'
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('opening', 'closing', 'custom')),
  task_description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_store ON checklist_templates(store_id);

-- 2. CHECKLIST LOGS (Execução diária pelos funcionários)
CREATE TABLE IF NOT EXISTS checklist_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES checklist_templates(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'pending', 'issue')),
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_logs_store ON checklist_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_checklist_logs_date ON checklist_logs(completed_at);

-- 3. EQUIPMENT (Cadastro de equipamentos monitorados)
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- Ex: 'Freezer Carnes', 'Geladeira Bebidas'
  min_temp NUMERIC,
  max_temp NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_store ON equipment(store_id);

-- 4. TEMPERATURE LOGS (Registros de medição de temperatura)
CREATE TABLE IF NOT EXISTS temperature_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  temperature NUMERIC NOT NULL,
  notes TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temperature_logs_store ON temperature_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_temperature_logs_equipment ON temperature_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_temperature_logs_date ON temperature_logs(recorded_at);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - Integração Multi-Loja
-- ==============================================================================

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para checklist_templates
CREATE POLICY "Multi-unit Access Select checklist_templates" ON checklist_templates FOR SELECT USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Insert checklist_templates" ON checklist_templates FOR INSERT WITH CHECK (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Update checklist_templates" ON checklist_templates FOR UPDATE USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Delete checklist_templates" ON checklist_templates FOR DELETE USING (public.has_access_to_store(store_id));

-- Políticas para checklist_logs
CREATE POLICY "Multi-unit Access Select checklist_logs" ON checklist_logs FOR SELECT USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Insert checklist_logs" ON checklist_logs FOR INSERT WITH CHECK (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Update checklist_logs" ON checklist_logs FOR UPDATE USING (public.has_access_to_store(store_id));

-- Políticas para equipment
CREATE POLICY "Multi-unit Access Select equipment" ON equipment FOR SELECT USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Insert equipment" ON equipment FOR INSERT WITH CHECK (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Update equipment" ON equipment FOR UPDATE USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Delete equipment" ON equipment FOR DELETE USING (public.has_access_to_store(store_id));

-- Políticas para temperature_logs
CREATE POLICY "Multi-unit Access Select temperature_logs" ON temperature_logs FOR SELECT USING (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Insert temperature_logs" ON temperature_logs FOR INSERT WITH CHECK (public.has_access_to_store(store_id));
CREATE POLICY "Multi-unit Access Update temperature_logs" ON temperature_logs FOR UPDATE USING (public.has_access_to_store(store_id));
