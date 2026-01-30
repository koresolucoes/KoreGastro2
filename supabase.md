
# Migração: Controle de Estoque Setorial e Requisições

Execute o script abaixo no SQL Editor do seu projeto Supabase para criar a estrutura necessária.

```sql
-- 1. Tabela para Estoque nas Estações (Praças)
CREATE TABLE IF NOT EXISTS station_stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL, -- Dono da empresa
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE NOT NULL,
  quantity NUMERIC DEFAULT 0,
  last_restock_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Garante que um ingrediente só apareça uma vez por estação
  UNIQUE(station_id, ingredient_id)
);

-- 2. Tabela para Cabeçalho das Requisições
CREATE TABLE IF NOT EXISTS requisitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  requested_by UUID REFERENCES employees(id), -- Quem pediu (Cozinheiro)
  station_id UUID REFERENCES stations(id), -- Para qual estação
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DELIVERED', 'PARTIAL')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE, -- Data da aprovação/entrega
  processed_by UUID REFERENCES employees(id) -- Quem aprovou (Almoxarife/Gerente)
);

-- 3. Tabela para Itens da Requisição
CREATE TABLE IF NOT EXISTS requisition_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  requisition_id UUID REFERENCES requisitions(id) ON DELETE CASCADE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) NOT NULL,
  quantity_requested NUMERIC NOT NULL,
  quantity_delivered NUMERIC, -- Pode ser diferente do pedido (ex: pediu 5kg, entregou 4kg)
  unit TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_station_stocks_station ON station_stocks(station_id);
CREATE INDEX IF NOT EXISTS idx_station_stocks_ingredient ON station_stocks(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status);
CREATE INDEX IF NOT EXISTS idx_requisitions_date ON requisitions(created_at);

-- 5. Row Level Security (RLS) - Segurança
ALTER TABLE station_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_items ENABLE ROW LEVEL SECURITY;

-- Políticas para station_stocks
CREATE POLICY "Users can view station stocks of their own restaurant" 
ON station_stocks FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert station stocks for their own restaurant" 
ON station_stocks FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update station stocks of their own restaurant" 
ON station_stocks FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete station stocks of their own restaurant" 
ON station_stocks FOR DELETE 
USING (auth.uid() = user_id);

-- Políticas para requisitions
CREATE POLICY "Users can view requisitions of their own restaurant" 
ON requisitions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert requisitions for their own restaurant" 
ON requisitions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update requisitions of their own restaurant" 
ON requisitions FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete requisitions of their own restaurant" 
ON requisitions FOR DELETE 
USING (auth.uid() = user_id);

-- Políticas para requisition_items
CREATE POLICY "Users can view requisition items of their own restaurant" 
ON requisition_items FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert requisition items for their own restaurant" 
ON requisition_items FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update requisition items of their own restaurant" 
ON requisition_items FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete requisition items of their own restaurant" 
ON requisition_items FOR DELETE 
USING (auth.uid() = user_id);
```

# Atualização de Descontos (Orders)

Execute para habilitar descontos globais e por item:

```sql
-- Adiciona colunas de desconto na tabela de pedidos (Desconto Global)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed_value')),
ADD COLUMN IF NOT EXISTS discount_value NUMERIC;

-- Adiciona colunas de desconto na tabela de itens (Desconto por Item)
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed_value')),
ADD COLUMN IF NOT EXISTS discount_value NUMERIC;
```