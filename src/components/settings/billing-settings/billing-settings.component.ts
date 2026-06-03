import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/core';
import { SupabaseService } from '../../../services/supabase.service';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  slug: string;
}

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-8 animate-in fade-in">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-black text-title title-display">Assinatura e Pagamento</h2>
          <p class="text-muted text-sm mt-1">Gerencie seu plano, métodos de pagamento e faturas do Mercado Pago.</p>
        </div>
      </div>
      
      <!-- Current Subscription Status -->
      <div class="bg-surface-elevated rounded-3xl p-8 border border-strong shadow-sm space-y-6">
        <h3 class="text-lg font-bold text-title flex items-center gap-2">
          <span translate="no" class="notranslate material-symbols-outlined text-brand">verified_user</span> Status da Assinatura
        </h3>
        
        @if (isLoading()) {
          <div class="animate-pulse space-y-4">
            <div class="h-4 bg-surface rounded w-1/4"></div>
            <div class="h-4 bg-surface rounded w-1/2"></div>
          </div>
        } @else {
          <div class="flex items-center justify-between p-6 bg-surface border border-subtle rounded-2xl">
            <div>
              <p class="text-[11px] font-black text-muted uppercase tracking-widest mb-1">Plano Atual</p>
              <p class="text-2xl font-black text-title">{{ currentSubscription()?.plan_name || 'Plano Grátis / Teste' }}</p>
              @if(currentSubscription()?.status) {
                 <p class="text-sm mt-2 font-medium" 
                    [class.text-success]="currentSubscription()?.status === 'active'"
                    [class.text-warning]="currentSubscription()?.status === 'past_due' || currentSubscription()?.status === 'unpaid'"
                    [class.text-danger]="currentSubscription()?.status === 'canceled'">
                   Status: {{ currentSubscription()?.status | uppercase }}
                 </p>
              }
            </div>
            <div class="text-right">
              @if(currentSubscription()?.status === 'active') {
                <button class="bg-surface-elevated text-danger font-bold px-6 py-3 rounded-2xl hover:bg-danger/10 transition-colors border border-danger/20">Cancelar Assinatura</button>
              }
            </div>
          </div>
        }
      </div>

      <!-- Plan Selection -->
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-title">Planos Disponíveis</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          @for (plan of plans(); track plan.id) {
            <div class="bg-surface-elevated rounded-3xl p-8 border hover:border-brand transition-all flex flex-col justify-between shadow-sm relative overflow-hidden group"
                 [class.border-brand]="currentSubscription()?.plan_id === plan.id"
                 [class.border-strong]="currentSubscription()?.plan_id !== plan.id">
              
              @if(currentSubscription()?.plan_id === plan.id) {
                <div class="absolute top-0 inset-x-0 h-1 bg-brand"></div>
                <div class="absolute top-4 right-4 bg-brand/10 text-brand text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Atual</div>
              }

              <div>
                <h4 class="text-xl font-bold text-title mb-2">{{ plan.name }}</h4>
                <div class="flex items-end gap-1 mb-4">
                  <span class="text-3xl font-black text-title data-mono">{{ plan.price | currency:'BRL' }}</span>
                  <span class="text-muted font-medium mb-1">/mês</span>
                </div>
                <p class="text-sm text-muted mb-8 leading-relaxed">{{ plan.description }}</p>
              </div>

              <button (click)="subscribe(plan)" 
                      [disabled]="currentSubscription()?.plan_id === plan.id || isProcessing()"
                      class="w-full py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                      [ngClass]="{
                        'bg-surface text-muted cursor-not-allowed': currentSubscription()?.plan_id === plan.id,
                        'bg-brand text-white hover:bg-brand-hover shadow-md active:scale-95': currentSubscription()?.plan_id !== plan.id && !isProcessing(),
                        'bg-surface-elevated text-muted border border-strong': isProcessing()
                      }">
                @if (isProcessing() && selectedPlanId() === plan.id) {
                   <span class="animate-spin material-symbols-outlined">sync</span> Processando...
                } @else if (currentSubscription()?.plan_id === plan.id) {
                   Seu Plano
                } @else {
                   Assinar Plano
                }
              </button>
            </div>
          }
        </div>
      </div>
      
      <div id="wallet_container" class="mt-8"></div>
    </div>
  `
})
export class BillingSettingsComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  
  plans = signal<Plan[]>([]);
  currentSubscription = signal<any>(null);
  isLoading = signal(true);
  isProcessing = signal(false);
  selectedPlanId = signal<string | null>(null);

  async ngOnInit() {
    await this.loadPlans();
    await this.loadSubscription();
    this.isLoading.set(false);
  }

  async loadPlans() {
    try {
      const { data, error } = await this.supabaseService.client
        .from('plans')
        .select('*')
        .order('price', { ascending: true });
        
      if (!error && data) {
        this.plans.set(data as Plan[]);
      }
    } catch (e) {
      console.error('Error fetching plans', e);
    }
  }

  async loadSubscription() {
    try {
      const { data: { user } } = await this.supabaseService.client.auth.getUser();
      if (!user) return;
      
      const { data, error } = await this.supabaseService.client
        .from('subscriptions')
        .select('*, plans(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!error && data) {
         this.currentSubscription.set({
           ...data,
           plan_name: data.plans?.name
         });
      }
    } catch (e) {
       console.error('Error fetching subscription', e);
    }
  }

  async subscribe(plan: Plan) {
    this.selectedPlanId.set(plan.id);
    this.isProcessing.set(true);

    try {
      const { data: { user } } = await this.supabaseService.client.auth.getUser();
      if (!user) return;

      const response = await fetch('/api/mercadopago-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          planName: plan.name,
          price: plan.price,
          userEmail: user.email,
          userId: user.id
        })
      });

      const resData = await response.json();
      if (resData.init_point) {
        // Redireciona para o checkout do Mercado Pago
        window.location.href = resData.init_point;
      } else {
        alert('Erro ao processar assinatura. Verifique as configurações de API do Mercado Pago no painel.');
      }
    } catch (error) {
      console.error(error);
      alert('Houve um erro de comunicação com o servidor.');
    } finally {
      this.isProcessing.set(false);
      this.selectedPlanId.set(null);
    }
  }
}
