CREATE POLICY "Permitir leitura pública de pedidos" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública de itens de pedido" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Permitir update publico notas e cliente" ON public.orders FOR UPDATE USING (true) WITH CHECK (true);
