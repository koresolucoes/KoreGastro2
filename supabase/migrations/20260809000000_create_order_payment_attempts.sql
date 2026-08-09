-- Migration: Create order_payment_attempts table
-- Description: Foundation for order payment attempts (Tenant Commerce domain)

CREATE TABLE IF NOT EXISTS public.order_payment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    provider text NOT NULL,
    payment_method text NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'CREATED'::text NOT NULL,
    provider_status text,
    idempotency_key text,
    provider_payment_id text,
    expires_at timestamp with time zone,
    approved_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_code text,
    failure_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT order_payment_attempts_pkey PRIMARY KEY (id),
    CONSTRAINT order_payment_attempts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT,
    CONSTRAINT order_payment_attempts_amount_check CHECK (amount > 0),
    CONSTRAINT order_payment_attempts_status_check CHECK (status = ANY (ARRAY['CREATED'::text, 'PENDING'::text, 'APPROVED'::text, 'FAILED'::text, 'EXPIRED'::text, 'CANCELLED'::text, 'REFUNDED'::text]))
);

ALTER TABLE public.order_payment_attempts OWNER TO postgres;

-- Comments
COMMENT ON TABLE public.order_payment_attempts IS 'Armazena as tentativas de pagamento associadas aos pedidos de um restaurante (Tenant Commerce).';
COMMENT ON COLUMN public.order_payment_attempts.id IS 'Identificador único da tentativa de pagamento.';
COMMENT ON COLUMN public.order_payment_attempts.order_id IS 'ID do pedido associado (raiz de ownership).';
COMMENT ON COLUMN public.order_payment_attempts.provider IS 'Provedor do pagamento (ex: mercadopago, cielo, cielo_lio, stone, rede, manual, ifood).';
COMMENT ON COLUMN public.order_payment_attempts.payment_method IS 'Forma de pagamento (ex: CASH, PIX, CREDIT_CARD, DEBIT_CARD, VOUCHER, IFOOD).';
COMMENT ON COLUMN public.order_payment_attempts.amount IS 'Valor financeiro da tentativa (deve ser maior que zero).';
COMMENT ON COLUMN public.order_payment_attempts.status IS 'Status interno da tentativa (CREATED, PENDING, APPROVED, FAILED, EXPIRED, CANCELLED, REFUNDED).';
COMMENT ON COLUMN public.order_payment_attempts.provider_status IS 'Status bruto retornado pelo provedor externo.';
COMMENT ON COLUMN public.order_payment_attempts.idempotency_key IS 'Chave de idempotência para evitar duplicação de chamadas.';
COMMENT ON COLUMN public.order_payment_attempts.provider_payment_id IS 'ID do pagamento gerado pelo provedor externo.';
COMMENT ON COLUMN public.order_payment_attempts.expires_at IS 'Data/hora limite para conclusão da tentativa (ex: expiração de QR Pix).';
COMMENT ON COLUMN public.order_payment_attempts.approved_at IS 'Data/hora em que a tentativa foi aprovada.';
COMMENT ON COLUMN public.order_payment_attempts.failed_at IS 'Data/hora em que a tentativa falhou.';
COMMENT ON COLUMN public.order_payment_attempts.failure_code IS 'Código de falha retornado ou mapeado.';
COMMENT ON COLUMN public.order_payment_attempts.failure_message IS 'Mensagem de falha para diagnóstico operacional (sem dados sensíveis).';
COMMENT ON COLUMN public.order_payment_attempts.metadata IS 'Metadados adicionais não normalizados em formato JSONB.';

-- Partial UNIQUE Indexes for Idempotency & External Provider Payment ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payment_attempts_provider_idempotency
    ON public.order_payment_attempts (provider, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payment_attempts_provider_payment_id
    ON public.order_payment_attempts (provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_order_payment_attempts_order_id
    ON public.order_payment_attempts (order_id);

CREATE INDEX IF NOT EXISTS idx_order_payment_attempts_order_id_status
    ON public.order_payment_attempts (order_id, status);

CREATE INDEX IF NOT EXISTS idx_order_payment_attempts_pending_expires
    ON public.order_payment_attempts (status, expires_at)
    WHERE status = 'PENDING' AND expires_at IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_order_payment_attempts_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_payment_attempts_updated_at_trigger
    BEFORE UPDATE ON public.order_payment_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_order_payment_attempts_updated_at();

-- Row Level Security (RLS)
ALTER TABLE public.order_payment_attempts ENABLE ROW LEVEL SECURITY;

-- Policy for Authenticated Users (ownership derived via order -> store)
CREATE POLICY "Multi-tenant access policy via order" ON public.order_payment_attempts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_payment_attempts.order_id
              AND public.has_access_to_store(o.user_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_payment_attempts.order_id
              AND public.has_access_to_store(o.user_id)
        )
    );
