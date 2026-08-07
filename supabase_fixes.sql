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
