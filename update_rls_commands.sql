-- Arquivo de migração para Fase 1 Parte 2: Permissões para Autoatendimento

-- 1. Primeiro adicionamos os novos status necessários no Enum table_status
ALTER TYPE public.table_status ADD VALUE IF NOT EXISTS 'CHAMANDO_GARCOM';

-- 2. Permitir que clientes invoquem as mudancas e chamar o garcom
-- A forma mais segura é criar uma função RPC (Remote Procedure Call) Security Definer
-- para que o cliente possa chamar e o banco execute com privilégios.

CREATE OR REPLACE FUNCTION public_call_waiter(p_session_token UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_number INT;
  v_user_id UUID;
BEGIN
  SELECT table_number, user_id INTO v_table_number, v_user_id
  FROM public.orders 
  WHERE session_token = p_session_token AND status = 'OPEN';

  IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
    UPDATE public.tables
    SET status = 'CHAMANDO_GARCOM'
    WHERE number = v_table_number AND user_id = v_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public_request_bill(p_session_token UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_number INT;
  v_user_id UUID;
BEGIN
  SELECT table_number, user_id INTO v_table_number, v_user_id
  FROM public.orders 
  WHERE session_token = p_session_token AND status = 'OPEN';

  IF v_table_number IS NOT NULL AND v_table_number > 0 THEN
    UPDATE public.tables
    SET status = 'PAGANDO'
    WHERE number = v_table_number AND user_id = v_user_id;
  END IF;
END;
$$;
