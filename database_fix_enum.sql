
-- ==============================================================================
-- FIX CRÍTICO: ATUALIZAÇÃO DO ENUM ORDER_TYPE
-- Execute este script no SQL Editor do Supabase para corrigir o erro:
-- "invalid input value for enum order_type: Tab"
-- ==============================================================================

-- Adiciona 'Tab' (Comandas) à lista de tipos de pedidos permitidos
ALTER TYPE "order_type" ADD VALUE IF NOT EXISTS 'Tab';

-- Garante que 'External-Delivery' também exista (para o módulo de Delivery)
ALTER TYPE "order_type" ADD VALUE IF NOT EXISTS 'External-Delivery';
