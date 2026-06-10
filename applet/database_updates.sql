-- Execute this SQL in your Supabase SQL Editor to add the preparation time column

ALTER TABLE public.recipe_preparations 
ADD COLUMN IF NOT EXISTS prep_time_in_minutes NUMERIC;

COMMENT ON COLUMN public.recipe_preparations.prep_time_in_minutes IS 'Tempo estimado de preparo para a coordenação do KDS (em minutos)';
