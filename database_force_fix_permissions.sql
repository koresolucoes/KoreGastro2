
-- ==============================================================================
-- FORCE FIX: REPOPULAR PERMISSÕES DE GERENTE (TODAS AS LOJAS)
-- Este script apaga e recria as permissões para garantir que nada esteja faltando.
-- ==============================================================================

DO $$
DECLARE
    store_record RECORD;
    gerente_role_id UUID;
    perm TEXT;
    
    -- Lista EXATA de todas as rotas do frontend (src/config/permissions.ts)
    all_permissions text[] := ARRAY[
        '/dashboard', 
        '/pos', 
        '/kds', 
        '/ifood-kds', 
        '/cashier', 
        '/inventory', 
        '/requisitions', 
        '/purchasing', 
        '/suppliers', 
        '/customers', 
        '/menu', 
        '/ifood-menu', 
        '/ifood-store-manager',
        '/technical-sheets', 
        '/mise-en-place', 
        '/performance', 
        '/reports', 
        '/employees', 
        '/schedules', 
        '/my-leave', 
        '/my-profile', 
        '/payroll', 
        '/settings', 
        '/reservations', 
        '/time-clock', 
        '/leave-management', 
        '/tutorials', 
        '/delivery'
    ];
BEGIN
    -- Loop por TODAS as lojas do sistema (para garantir que resolva independente do usuário logado no SQL editor)
    -- Em produção, você poderia filtrar por owner_id = auth.uid() se quisesse limitar.
    FOR store_record IN SELECT * FROM public.stores LOOP
        
        RAISE NOTICE 'Corrigindo Loja: % (ID: %)', store_record.name, store_record.id;

        -- 1. Identificar ou Criar o Cargo 'Gerente' nesta loja específica
        SELECT id INTO gerente_role_id 
        FROM public.roles 
        WHERE user_id = store_record.id AND name = 'Gerente' 
        LIMIT 1;

        IF gerente_role_id IS NULL THEN
            INSERT INTO public.roles (name, user_id) 
            VALUES ('Gerente', store_record.id) 
            RETURNING id INTO gerente_role_id;
            RAISE NOTICE ' - Cargo Gerente criado.';
        ELSE
            RAISE NOTICE ' - Cargo Gerente encontrado (ID: %)', gerente_role_id;
        END IF;

        -- 2. LIMPEZA TOTAL das permissões deste cargo (para evitar duplicatas ou lixo)
        DELETE FROM public.role_permissions WHERE role_id = gerente_role_id;

        -- 3. REINSERÇÃO EM MASSA de todas as permissões
        FOREACH perm IN ARRAY all_permissions LOOP
            INSERT INTO public.role_permissions (role_id, user_id, permission_key)
            VALUES (gerente_role_id, store_record.id, perm);
        END LOOP;
        
        RAISE NOTICE ' - Permissões recriadas com sucesso.';

        -- 4. Garantir que existe um funcionário vinculado a este cargo
        -- Se não houver nenhum funcionário 'Gerente', o dono não consegue logar operacionalmente.
        IF NOT EXISTS (SELECT 1 FROM public.employees WHERE role_id = gerente_role_id AND user_id = store_record.id) THEN
            INSERT INTO public.employees (user_id, name, pin, role_id)
            VALUES (store_record.id, 'Gerente Principal', '1234', gerente_role_id);
            RAISE NOTICE ' - Funcionário de emergência criado (PIN: 1234).';
        END IF;

    END LOOP;
END $$;
