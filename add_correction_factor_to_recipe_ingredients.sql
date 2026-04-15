-- Adiciona a coluna correction_factor na tabela recipe_ingredients
ALTER TABLE "public"."recipe_ingredients" ADD COLUMN IF NOT EXISTS "correction_factor" numeric DEFAULT 1.0;

-- Comentário explicativo
COMMENT ON COLUMN "public"."recipe_ingredients"."correction_factor" IS 'Fator de correção ou cocção do ingrediente na receita';
