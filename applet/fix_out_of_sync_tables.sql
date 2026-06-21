-- Run this query in the SQL editor to restore invisble tables to their correct units.
-- The bug caused tables to have a user_id different from their parent hall's user_id.

UPDATE public.tables t
SET user_id = h.user_id
FROM public.halls h
WHERE t.hall_id = h.id 
  AND t.user_id != h.user_id;

