
-- ==============================================================================
-- FIX: ADICIONAR TIPO 'Abertura de Caixa' AO ENUM
-- Corrige o erro "invalid input value for enum transaction_type" ao fechar caixa
-- ==============================================================================

-- Adiciona o valor ao tipo enum, se ele ainda não existir
-- PostgreSQL não suporta 'IF NOT EXISTS' diretamente em ADD VALUE antes da v12,
-- mas o Supabase geralmente roda versões recentes. Se falhar, é porque já existe.
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'Abertura de Caixa';
