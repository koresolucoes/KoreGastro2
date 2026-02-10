
-- 1. Tabela de Cabeçalho dos Templates (Kits)
CREATE TABLE IF NOT EXISTS requisition_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL, -- Vínculo com a Loja
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE, -- Opcional: O template pode ser específico de uma praça
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Itens do Template
CREATE TABLE IF NOT EXISTS requisition_template_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES requisition_templates(id) ON DELETE CASCADE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE NOT NULL,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Índices e Performance
CREATE INDEX IF NOT EXISTS idx_req_templates_user ON requisition_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_req_templates_station ON requisition_templates(station_id);
CREATE INDEX IF NOT EXISTS idx_req_template_items_template ON requisition_template_items(template_id);

-- 4. Habilitar RLS (Segurança)
ALTER TABLE requisition_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_template_items ENABLE ROW LEVEL SECURITY;

-- Políticas para requisition_templates
CREATE POLICY "Multi-unit Access Select" ON requisition_templates
FOR SELECT USING ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Insert" ON requisition_templates
FOR INSERT WITH CHECK ( public.has_access_to_store(user_id) );

CREATE POLICY "Multi-unit Access Delete" ON requisition_templates
FOR DELETE USING ( public.has_access_to_store(user_id) );

-- Políticas para requisition_template_items
-- Acesso indireto via template pai
CREATE POLICY "Multi-unit Access Select Items" ON requisition_template_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM requisition_templates rt 
        WHERE rt.id = requisition_template_items.template_id 
        AND public.has_access_to_store(rt.user_id)
    )
);

CREATE POLICY "Multi-unit Access Insert Items" ON requisition_template_items
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM requisition_templates rt 
        WHERE rt.id = requisition_template_items.template_id 
        AND public.has_access_to_store(rt.user_id)
    )
);

CREATE POLICY "Multi-unit Access Delete Items" ON requisition_template_items
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM requisition_templates rt 
        WHERE rt.id = requisition_template_items.template_id 
        AND public.has_access_to_store(rt.user_id)
    )
);
