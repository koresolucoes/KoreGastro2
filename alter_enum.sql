-- Adicionar CHAMANDO_GARCOM no enum de table_status
ALTER TYPE public.table_status ADD VALUE IF NOT EXISTS 'CHAMANDO_GARCOM';
