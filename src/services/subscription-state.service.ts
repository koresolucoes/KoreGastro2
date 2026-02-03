
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Subscription, Plan } from '../models/db.models';
import { DemoService } from './demo.service';
import { UnitContextService } from './unit-context.service';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  private demoService = inject(DemoService);
  private unitContextService = inject(UnitContextService);
  private authService = inject(AuthService);
  
  plans = signal<Plan[]>([]);
  subscriptions = signal<Subscription[]>([]);
  activeUserPermissions = signal<Set<string>>(new Set());
  ownerStoreCount = signal<number>(0);

  constructor() {
      // Effect to load subscription logic when the active unit changes
      effect(async () => {
          const activeUnitId = this.unitContextService.activeUnitId();
          // Reset state when switching units to avoid stale data
          this.subscriptions.set([]); 
          
          if (activeUnitId && !this.demoService.isDemoMode()) {
              await this.loadSubscriptionForUnit(activeUnitId);
          }
      }, { allowSignalWrites: true });
  }

  async loadSubscriptionForUnit(storeId: string) {
      console.log(`[Subscription] Iniciando verificação para a Loja: ${storeId}`);
      let ownerId: string | null = null;
      let subscriptionFound = false;

      // --- ESTRATÉGIA 1: O ID da Loja é um Usuário com Assinatura? (Legado / Minha Loja) ---
      // Verifica se existe uma assinatura ativa diretamente para este ID. 
      // Isso cobre o caso "Minha Loja Principal" onde StoreID == UserID.
      const { data: directSubs } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', storeId)
          .in('status', ['active', 'trialing'])
          .limit(1);

      if (directSubs && directSubs.length > 0) {
          console.log('[Subscription] Estratégia 1: Assinatura encontrada diretamente no ID da loja.');
          this.subscriptions.set(directSubs);
          ownerId = storeId;
          subscriptionFound = true;
      }

      // --- ESTRATÉGIA 2: Buscar o Dono da Loja (Para novas lojas) ---
      if (!subscriptionFound) {
          // Tenta descobrir quem é o owner_id desta loja
          // 2a. Via tabela 'stores'
          const { data: store } = await supabase
              .from('stores')
              .select('owner_id')
              .eq('id', storeId)
              .maybeSingle();

          if (store?.owner_id) {
              ownerId = store.owner_id;
              console.log(`[Subscription] Estratégia 2a: Dono identificado via tabela stores: ${ownerId}`);
          } 
          
          // 2b. Via 'unit_permissions' (Fallback se RLS bloquear leitura de stores)
          if (!ownerId) {
              const { data: perm } = await supabase
                  .from('unit_permissions')
                  .select('manager_id')
                  .eq('store_id', storeId)
                  .eq('role', 'owner')
                  .maybeSingle();
              
              if (perm?.manager_id) {
                  ownerId = perm.manager_id;
                  console.log(`[Subscription] Estratégia 2b: Dono identificado via permissões: ${ownerId}`);
              }
          }

          // Se achamos um dono, buscamos a assinatura DELE
          if (ownerId) {
              const { data: ownerSubs, error: subError } = await supabase
                  .from('subscriptions')
                  .select('*')
                  .eq('user_id', ownerId)
                  .in('status', ['active', 'trialing'])
                  .order('created_at', { ascending: false });

              if (ownerSubs && ownerSubs.length > 0) {
                  console.log(`[Subscription] Assinatura ativa encontrada para o dono ${ownerId}.`);
                  this.subscriptions.set(ownerSubs);
                  subscriptionFound = true;
              } else {
                  console.warn(`[Subscription] Dono encontrado (${ownerId}), mas SEM assinatura ativa.`);
              }
          } else {
              console.error('[Subscription] FALHA CRÍTICA: Não foi possível identificar o dono da loja.');
          }
      }

      // --- Carregar Planos e Contagem (Apenas se achou dono ou assinatura) ---
      if (ownerId || subscriptionFound) {
          const targetUser = ownerId || storeId; // Fallback seguro
          
          // Carregar planos (cache simples)
          if (this.plans().length === 0) {
              const { data: plans } = await supabase.from('plans').select('*');
              if (plans) this.plans.set(plans);
          }
          
          // Contar lojas (para validar limites do plano)
          // Se falhar a leitura de stores, assumimos 1 para não bloquear injustamente
          const { count } = await supabase
            .from('stores')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', targetUser);
            
          this.ownerStoreCount.set(count || 1);
      } else {
          // Se chegou aqui, não achou dono nem assinatura. Limpa tudo.
          this.subscriptions.set([]);
      }
  }

  hasActiveSubscription = computed(() => {
    if (this.demoService.isDemoMode()) return true;

    const subs = this.subscriptions();
    if (subs.length === 0) return false;
    
    // Pega a primeira assinatura válida
    const activeSub = subs.find(s => s.status === 'active' || s.status === 'trialing');
    if (!activeSub) return false;

    // Validação de Limite de Lojas
    const plan = this.plans().find(p => p.id === activeSub.plan_id);
    if (plan && plan.max_stores) {
        // Se o usuário tem mais lojas do que o plano permite, poderíamos bloquear.
        // Por enquanto, apenas logamos o aviso para não travar operação existente.
        if (this.ownerStoreCount() > plan.max_stores) {
            console.warn(`[Subscription] Limite de lojas excedido. Plano: ${plan.max_stores}, Atual: ${this.ownerStoreCount()}`);
        }
    }
    
    return true;
  });

  subscription = computed(() => this.subscriptions()[0] ?? null);
  
  currentPlan = computed(() => {
    const sub = this.subscription();
    const plans = this.plans();
    if (!sub) return null;
    return plans.find(p => p.id === sub.plan_id) ?? null;
  });

  isTrialing = computed(() => {
    if (this.demoService.isDemoMode()) return false;
    
    const sub = this.subscription();
    if (!sub) return false;

    if (sub.status === 'trialing') return true;
    
    // Lógica para verificar período de trial "virtual" baseado na data de criação
    const plan = this.currentPlan();
    if (plan && plan.trial_period_days && plan.trial_period_days > 0 && sub.recurrent === false) {
      const createdAt = new Date(sub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + plan.trial_period_days);
      return new Date() < trialEndDate;
    }
    
    return false;
  });

  trialDaysRemaining = computed(() => {
    const sub = this.subscription();
    if (!this.isTrialing() || !sub) return null;

    let endDate: Date;

    if (sub.status === 'trialing' && sub.current_period_end) {
        endDate = new Date(sub.current_period_end);
    } else {
        const plan = this.currentPlan();
        if (!plan || !plan.trial_period_days) return 0;
        const createdAt = new Date(sub.created_at);
        endDate = new Date(createdAt);
        endDate.setDate(endDate.getDate() + plan.trial_period_days);
    }

    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  });

  clearData() {
    this.plans.set([]);
    this.subscriptions.set([]);
    this.activeUserPermissions.set(new Set());
    this.ownerStoreCount.set(0);
  }
}
