-- Clients can update their own tickets
CREATE POLICY "Clients can update their tickets"
ON public.support_tickets FOR UPDATE
USING (client_id = auth.uid());

-- Clients can insert messages
CREATE POLICY "Clients can create messages"
ON public.support_ticket_messages FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND client_id = auth.uid()));
