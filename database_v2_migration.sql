
-- Add Par Level to Recipes for Demand Calculation
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS par_level NUMERIC DEFAULT 0;

-- Enhance Production Tasks for Smart Kitchen V2
ALTER TABLE production_tasks
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS batch_code TEXT,
ADD COLUMN IF NOT EXISTS source_batches JSONB DEFAULT '[]'::jsonb, -- Array of { ingredientId, lotId }
ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'production' CHECK (task_type IN ('production', 'thawing', 'prep')),
ADD COLUMN IF NOT EXISTS target_stock NUMERIC; -- Snapshot of what the target was at creation

-- Index for sorting by priority
CREATE INDEX IF NOT EXISTS idx_production_tasks_priority ON production_tasks(priority);
