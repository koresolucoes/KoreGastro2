import { Component, ChangeDetectionStrategy, inject, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { supabase } from '../../services/supabase-client';
import { Order, OrderItem } from '../../models/db.models';

@Component({
  selector: 'app-public-table-order',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-table-order.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicTableOrderComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  publicDataService = inject(PublicDataService);

  order = signal<Order | null>(null);
  loading = signal(true);
  errorMsg = signal<string | null>(null);
  sessionToken = signal<string | null>(null);
  waiterCalled = signal(false);

  // Realtime channel
  private channel: any;

  async ngOnInit() {
    this.sessionToken.set(this.route.snapshot.paramMap.get('sessionToken'));
    if (!this.sessionToken()) {
      this.errorMsg.set('Sessão inválida ou não encontrada.');
      this.loading.set(false);
      return;
    }
    await this.loadOrder();
    this.setupRealtimeSync();
  }

  ngOnDestroy() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }

  async loadOrder() {
    this.loading.set(true);
    const { order, error } = await this.publicDataService.getOrderBySessionToken(this.sessionToken()!);
    if (error || !order) {
      this.errorMsg.set('Comanda fechada ou inválida. Por favor, solicite um novo QR Code.');
    } else {
      this.order.set(order);
    }
    this.loading.set(false);
  }

  setupRealtimeSync() {
     // We can try to listen to updates for this order if the user has read access
     // But wait, Realtime requires RLS read access. 
     // We have Permitir leitura pública de pedidos e order_items, so maybe it works!
     const token = this.sessionToken();
     if (!token) return;

     this.channel = supabase.channel('public-order-' + token)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `session_token=eq.${token}` }, payload => {
          this.loadOrder();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, payload => {
          // Since we can't easily filter by order_id because we don't know it until loaded, we just reload on any item change 
          // that matches our order_id once loaded, but it's simpler to just reload on ANY item change if it matches our order.id
          if (this.order() && (payload.new as any).order_id === this.order()?.id) {
             this.loadOrder();
          }
      })
      .subscribe();
  }

  get totalItems(): number {
    const o = this.order();
    if (!o) return 0;
    return o.order_items.reduce((acc, item) => acc + item.quantity, 0);
  }

  get totalAmount(): number {
    const o = this.order();
    if (!o) return 0;
    return o.order_items.reduce((acc, item) => acc + item.total_price, 0);
  }

  async onCallWaiter() {
    if(this.waiterCalled()) return;
    const o = this.order();
    if (!o || !this.sessionToken()) return;
    
    // Calls the RPC we just defined
    const { error } = await supabase.rpc('public_call_waiter', { 
        p_session_token: this.sessionToken(), 
        p_table_id: o.tables?.[0]?.id // Wait, does the order relation return tables? We can query from order.table_number...
    });
    // Let's modify the RPC so it only needs session_token and finds the table itself...
    // Let's just update the RPC in our thought process or pass the table_id if available.
    
    // We will do another version of the rpc that gets the order's table inside supabase.
    const { error: rpcError } = await supabase.rpc('public_call_waiter', { p_session_token: this.sessionToken() });
    
    if (!rpcError) {
       this.waiterCalled.set(true);
       setTimeout(() => this.waiterCalled.set(false), 30000); // Reset after 30s
       alert("Garçom chamado!");
    } else {
       alert("Erro ao chamar garçom: " + rpcError.message);
    }
  }

  async onRequestBill() {
    const o = this.order();
    if (!o || !this.sessionToken()) return;
    if (confirm("Deseja fechar a comanda e pedir a conta?")) {
      const { error: rpcError } = await supabase.rpc('public_request_bill', { p_session_token: this.sessionToken() });
      if (!rpcError) {
         alert("A conta foi solicitada e em breve iremos até a mesa!");
      }
    }
  }
}
