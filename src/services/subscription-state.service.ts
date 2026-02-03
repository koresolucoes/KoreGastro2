
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

      // --- ESTRATÉGIA 1: Assinatura vinculada diretamente à LOJA (Novo Schema) ---
      // Verifica se a assinatura tem o campo store_id preenchido com o ID atual
      const { data: storeSubs, error: storeSubError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('store_id', storeId)
          .in('status', ['active', 'trialing'])
          .order('created_at', { ascending: false });

      if (storeSubs && storeSubs.length > 0) {
          console.log('[Subscription] Sucesso: Assinatura encontrada vinculada diretamente à loja (store_id).');
          this.subscriptions.set(storeSubs);
          subscriptionFound = true;
          // Se achou por loja, o ownerId será o user_id dessa assinatura
          ownerId = storeSubs[0].user_id;
      }

      // --- ESTRATÉGIA 2: Assinatura do DONO da loja (Modelo Global) ---
      if (!subscriptionFound) {
          // Precisamos descobrir quem é o dono desta loja
          
          // 2a. Tenta ler a tabela 'stores' diretamente
          const { data: store, error: storeError } = await supabase
              .from('stores')
              .select('owner_id')
              .eq('id', storeId)
              .maybeSingle();

          if (store?.owner_id) {
              ownerId = store.owner_id;
          } else {
             // 2b. Fallback: Tenta descobrir via permissões se o RLS da tabela stores falhar
             console.warn('[Subscription] Não foi possível ler owner_id da tabela stores. Tentando via permissões...');
             const { data: perm } = await supabase
                  .from('unit_permissions')
                  .select('manager_id')
                  .eq('store_id', storeId)
                  .eq('role', 'owner')
                  .maybeSingle();
              
              if (perm?.manager_id) {
                  ownerId = perm.manager_id;
              }
          }

          // Se identificamos o dono, buscamos se ELE tem uma assinatura "global" (store_id is null ou user_id bate)
          if (ownerId) {
              const { data: ownerSubs } = await supabase
                  .from('subscriptions')
                  .select('*')
                  .eq('user_id', ownerId)
                  .in('status', ['active', 'trialing'])
                  .order('created_at', { ascending: false });

              if (ownerSubs && ownerSubs.length > 0) {
                  console.log(`[Subscription] Sucesso: Assinatura encontrada para o dono da loja (${ownerId}).`);
                  this.subscriptions.set(ownerSubs);
                  subscriptionFound = true;
              } else {
                  console.warn(`[Subscription] O dono (${ownerId}) foi identificado, mas NÃO possui assinatura ativa.`);
              }
          } else {
              // 2c. Fallback Legado: Se tudo falhar, assume que StoreID = UserID (Single Store antiga)
              // Tenta buscar assinatura onde user_id = storeId
               const { data: legacySubs } = await supabase
                  .from('subscriptions')
                  .select('*')
                  .eq('user_id', storeId)
                  .in('status', ['active', 'trialing']);
                
                if (legacySubs && legacySubs.length > 0) {
                    console.log('[Subscription] Sucesso: Modo legado (UserID = StoreID).');
                    this.subscriptions.set(legacySubs);
                    ownerId = storeId;
                    subscriptionFound = true;
                }
          }
      }

      if (!subscriptionFound) {
          console.error('[Subscription] FALHA: Nenhuma assinatura ativa encontrada para esta loja ou seu dono.');
          this.subscriptions.set([]);
      }

      // --- Carregar Planos e Limites (apenas se temos um contexto de dono/loja) ---
      if (ownerId || subscriptionFound) {
          const targetUser = ownerId || storeId;
          
          // Carregar definições de planos
          if (this.plans().length === 0) {
              const { data: plans } = await supabase.from('plans').select('*');
              if (plans) this.plans.set(plans);
          }
          
          // Contagem de lojas (para validar limites do plano)
          const { count } = await supabase
            .from('stores')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', targetUser);
            
          this.ownerStoreCount.set(count || 1);
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
        if (this.ownerStoreCount() > plan.max_stores) {
            console.warn(`[Subscription] Limite de lojas excedido. Plano permite: ${plan.max_stores}, Atual: ${this.ownerStoreCount()}`);
            // Opcional: retornar false aqui se quiser bloquear acesso rigorosamente
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
