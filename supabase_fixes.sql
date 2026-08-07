-- M1: Add deleted_at to all major tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- M3: Missing indexes for high-cardinality queries
CREATE INDEX IF NOT EXISTS idx_orders_user_id_status_timestamp ON orders (user_id, status, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id_recipe_id ON order_items (order_id, recipe_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_user_id_ingredient_id ON inventory_logs (user_id, ingredient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_entries_user_id_clock_in ON time_clock_entries (user_id, clock_in_time DESC);

-- Also useful indexes
CREATE INDEX IF NOT EXISTS idx_reservations_user_id_time ON reservations (user_id, reservation_time);

-- M8: Missing Critical Indexes in Webhook Logs Table
CREATE INDEX IF NOT EXISTS idx_ifood_webhook_logs_merchant_id_created_at ON ifood_webhook_logs (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ifood_webhook_logs_ifood_order_id ON ifood_webhook_logs (ifood_order_id);
CREATE INDEX IF NOT EXISTS idx_ifood_webhook_logs_event_code_status ON ifood_webhook_logs (event_code, processing_status);

-- M10: Optimistic locking for ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
-- M11: Missing Foreign Key Restrictions
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_recipe_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;

-- M14: Unique constraint on (user_id, external_code) in recipes
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_user_id_external_code_key;
ALTER TABLE recipes ADD CONSTRAINT recipes_user_id_external_code_key UNIQUE (user_id, external_code);
-- M16: DLQ for failed webhooks
CREATE TABLE IF NOT EXISTS webhook_dlq (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    webhook_url TEXT,
    event_type TEXT,
    payload JSONB,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
