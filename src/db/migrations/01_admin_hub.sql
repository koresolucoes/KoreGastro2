-- Create Support Tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    priority TEXT DEFAULT 'Média' CHECK (priority IN ('Baixa', 'Média', 'Alta', 'Urgente')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create Support Ticket Messages table
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id UUID, -- Can be null for system messages, otherwise auth user ID
    sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'admin', 'system')),
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policies for support_tickets
-- Admins can read all tickets
CREATE POLICY "Admins can view all tickets"
ON public.support_tickets FOR SELECT
USING (EXISTS (SELECT 1 FROM public.system_admins WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- Admins can create tickets
CREATE POLICY "Admins can create tickets"
ON public.support_tickets FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.system_admins WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- Admins can update tickets
CREATE POLICY "Admins can update tickets"
ON public.support_tickets FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.system_admins WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- Clients can read their own tickets
CREATE POLICY "Clients can view their tickets"
ON public.support_tickets FOR SELECT
USING (client_id = auth.uid());

-- Clients can create tickets
CREATE POLICY "Clients can create tickets"
ON public.support_tickets FOR INSERT
WITH CHECK (client_id = auth.uid());

-- Policies for support_ticket_messages
-- Admins can read all messages
CREATE POLICY "Admins can view all messages"
ON public.support_ticket_messages FOR SELECT
USING (EXISTS (SELECT 1 FROM public.system_admins WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- Admins can insert messages
CREATE POLICY "Admins can create messages"
ON public.support_ticket_messages FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.system_admins WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- Clients can read messages for their tickets
CREATE POLICY "Clients can view messages for their tickets"
ON public.support_ticket_messages FOR SELECT
USING (EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND client_id = auth.uid()));

-- Clients can insert messages for their tickets
CREATE POLICY "Clients can create messages for their tickets"
ON public.support_ticket_messages FOR INSERT
WITH CHECK (
    sender_type = 'client' 
    AND sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND client_id = auth.uid())
);

-- System Admins table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.system_admins (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Note: You need to insert your email into system_admins to use the admin panel!
-- INSERT INTO public.system_admins (email) VALUES ('seu-email@gmail.com');

-- Function to get admin stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_clients INT;
    active_subscriptions INT;
    mrr NUMERIC;
    recent_tickets INT;
BEGIN
    -- Check if user is admin
    IF NOT EXISTS (SELECT 1 FROM public.system_admins WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Calculate stats
    SELECT COUNT(*) INTO total_clients FROM auth.users;
    
    SELECT COUNT(*) INTO active_subscriptions FROM public.subscriptions WHERE status = 'active';
    
    -- Assuming a plan table or just calculating based on standard values for now
    -- Alternatively, could just set a default MRR
    SELECT COALESCE(SUM(p.price_monthly), 0) INTO mrr 
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
    WHERE s.status = 'active';

    SELECT COUNT(*) INTO recent_tickets FROM public.support_tickets WHERE status = 'open';

    RETURN json_build_object(
        'totalClients', total_clients,
        'activeSubscriptions', active_subscriptions,
        'mrr', mrr,
        'systemHealth', 99.9,
        'activeTickets', recent_tickets
    );
END;
$$;
