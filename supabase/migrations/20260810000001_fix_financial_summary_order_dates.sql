-- Repair the financial report after the orders table moved from created_at to
-- timestamp/completed_at. The old function raised SQLSTATE 42703 for every
-- sales report request because orders.created_at does not exist.

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_user_id uuid,
  p_start_date timestamp without time zone,
  p_end_date timestamp without time zone
) RETURNS TABLE(
  total_revenue numeric,
  total_expenses numeric,
  net_profit numeric,
  total_orders integer,
  average_ticket numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
    AND NOT public.has_access_to_store(p_user_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Access denied to store %', p_user_id;
  END IF;

  RETURN QUERY
  WITH sales_stats AS (
    SELECT COALESCE(SUM(amount), 0) AS revenue
    FROM public.transactions
    WHERE user_id = p_user_id
      AND type = 'Receita'
      AND date >= p_start_date
      AND date <= p_end_date
      AND deleted_at IS NULL
  ),
  expense_stats AS (
    SELECT COALESCE(SUM(amount), 0) AS expenses
    FROM public.transactions
    WHERE user_id = p_user_id
      AND type = 'Despesa'
      AND date >= p_start_date
      AND date <= p_end_date
      AND deleted_at IS NULL
  ),
  order_stats AS (
    SELECT COUNT(*) AS count
    FROM public.orders
    WHERE user_id = p_user_id
      AND status = 'COMPLETED'
      AND COALESCE(completed_at, "timestamp") >= p_start_date
      AND COALESCE(completed_at, "timestamp") <= p_end_date
      AND deleted_at IS NULL
  )
  SELECT
    s.revenue,
    e.expenses,
    s.revenue - e.expenses,
    o.count::integer,
    CASE WHEN o.count > 0 THEN ROUND(s.revenue / o.count, 2) ELSE 0 END
  FROM sales_stats s, expense_stats e, order_stats o;
END;
$$;

REVOKE ALL ON FUNCTION public.get_financial_summary(uuid, timestamp without time zone, timestamp without time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summary(uuid, timestamp without time zone, timestamp without time zone) TO authenticated, service_role;
