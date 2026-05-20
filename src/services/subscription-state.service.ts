
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Subscription, Plan } from '../models/db.models';
import { DemoService } from './demo.service';
import { UnitContextService } from './unit-context.service';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { ALL_PERMISSION_KEYS } from '../config/permissions';

@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  private demoService = inject(DemoService);
  private unitContextService = inject(UnitContextService);
  private authService = inject(AuthService);
  
  plans = signal<Plan[]>([]);
  subscriptions = signal<Subscription[]>([]);
  activeUserPermissions = signal<Set<string>>(new Set());
  ownerStoreCount = signal<number>(0);
  storeCreatedAt = signal<string | null>(null);
  
  // Novo sinal para indicar que a verificação de assinatura está em andamento
  isLoading = signal<boolean>(true);

  constructor() {
      // Effect to load subscription logic when the active unit changes
      effect(async () => {
          const activeUnitId = this.unitContextService.activeUnitId();
          
          if (this.demoService.isDemoMode()) {
              this.activeUserPermissions.set(new Set(ALL_PERMISSION_KEYS));
              this.isLoading.set(false);
              return;
          }

          if (activeUnitId) {
              await this.loadSubscriptionForUnit(activeUnitId);
          } else {
              // Se não tem unidade, não tem o que carregar, mas paramos o loading
              this.isLoading.set(false);
          }
      }, { allowSignalWrites: true });
  }

  async loadSubscriptionForUnit(storeId: string) {
      this.isLoading.set(true);
      console.log(`[Subscription] Iniciando verificação para a Loja: ${storeId}`);
      
      // Reset state clean
      this.subscriptions.set([]); 
      this.activeUserPermissions.set(new Set()); // Reset permissions to prevent stale access
      this.storeCreatedAt.set(null);
      
      let ownerId: string | null = null;
      let subscriptionFound = false;
      const currentUser = this.authService.currentUser();

      try {
          // --- FETCH STORE METADATA ---
          const { data: storeInfo } = await supabase.from('stores').select('created_at, owner_id').eq('id', storeId).maybeSingle();
          if (storeInfo?.created_at) {
              this.storeCreatedAt.set(storeInfo.created_at);
          }
          if (storeInfo?.owner_id) {
              ownerId = storeInfo.owner_id;
          }

          // --- ESTRATÉGIA 0: Verificar Contexto Local (Mais rápido e ignora RLS) ---
          const activeUnitContext = this.unitContextService.availableUnits().find(u => u.id === storeId);
          
          if (activeUnitContext && activeUnitContext.role === 'owner' && currentUser) {
              ownerId = currentUser.id;
          }

          // --- ESTRATÉGIA 1: Assinatura vinculada diretamente à LOJA (Novo Schema) ---
          if (!subscriptionFound) {
              const { data: storeSubs } = await supabase
                  .from('subscriptions')
                  .select('*')
                  .eq('store_id', storeId)
                  .in('status', ['active', 'trialing'])
                  .order('created_at', { ascending: false });

              if (storeSubs && storeSubs.length > 0) {
                  console.log('[Subscription] Sucesso: Assinatura encontrada vinculada diretamente à loja (store_id).');
                  this.subscriptions.set(storeSubs);
                  subscriptionFound = true;
                  if (!ownerId) ownerId = storeSubs[0].user_id;
              }
          }

          // --- ESTRATÉGIA 2: Buscar Dono no Banco (Fallback se contexto falhar) ---
          if (!ownerId && !subscriptionFound) {
              const { data: store } = await supabase
                  .from('stores')
                  .select('owner_id')
                  .eq('id', storeId)
                  .maybeSingle();

              if (store?.owner_id) {
                  ownerId = store.owner_id;
              } else {
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
          }

          // --- ESTRATÉGIA 3: Buscar Assinatura do Dono (Modelo Global) ---
          if (ownerId && !subscriptionFound) {
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
              }
          }

          if (!subscriptionFound) {
              console.warn('[Subscription] Nenhuma assinatura ativa encontrada para esta loja.');
              this.subscriptions.set([]);
              
              // Implicit Trial Permissions Fallback
              if (storeInfo?.created_at) {
                  const createdAt = new Date(storeInfo.created_at);
                  const trialEnd = new Date(createdAt);
                  trialEnd.setDate(trialEnd.getDate() + 30);
                  if (new Date() < trialEnd) {
                      console.log('[Subscription] Iniciando Implicit Trial permissions.');
                      this.activeUserPermissions.set(new Set(ALL_PERMISSION_KEYS));
                  }
              }
          } else {
              // --- CRITICAL FIX: Load Permissions for the Found Plan ---
              const activeSub = this.subscriptions()[0];
              if (activeSub && activeSub.plan_id) {
                  const { data: planPerms } = await supabase
                      .from('plan_permissions')
                      .select('permission_key')
                      .eq('plan_id', activeSub.plan_id);
                  
                  if (planPerms && planPerms.length > 0) {
                      // Ensure types are handled correctly for Set
                      const permKeys = planPerms.map((p: any) => String(p.permission_key));
                      
                      // Fallback auto-granting for newer routes to avoid breaking access for old plans
                      if (permKeys.includes('/dashboard') || permKeys.includes('/menu') || permKeys.includes('/ifood-kds')) {
                        if (!permKeys.includes('/menu-builder')) permKeys.push('/menu-builder');
                        if (!permKeys.includes('/ifood-store-manager')) permKeys.push('/ifood-store-manager');
                      }

                      const permSet = new Set<string>(permKeys);
                      this.activeUserPermissions.set(permSet);
                      console.log(`[Subscription] Permissões carregadas: ${permSet.size}`);
                  }
              }
          }

          // --- Carregar Planos e Limites ---
          if (this.plans().length === 0) {
              const { data: plans } = await supabase.from('plans').select('*');
              if (plans) this.plans.set(plans);
          }
          
          // Se achamos um dono ou loja, verificamos limites
          const targetUser = ownerId || storeId;
          if (targetUser) {
            const { count } = await supabase
                .from('stores')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', targetUser);
                
            this.ownerStoreCount.set(count || 1);
          }
          
      } catch (err) {
          console.error('[Subscription] Erro fatal ao verificar assinatura:', err);
      } finally {
          // IMPORTANT: Signal that loading is finished so guards can proceed
          this.isLoading.set(false);
      }
  }

  implicitTrialDaysRemaining = computed(() => {
    const createdAt = this.storeCreatedAt();
    if (!createdAt) return 0;
    const storeDate = new Date(createdAt);
    const trialEndDate = new Date(storeDate);
    trialEndDate.setDate(trialEndDate.getDate() + 30);
    const now = new Date();
    const diffTime = trialEndDate.getTime() - now.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  });

  hasActiveSubscription = computed(() => {
    if (this.demoService.isDemoMode()) return true;
    
    // Se ainda está carregando, assumimos true temporariamente para não piscar a tela de erro
    // O AppComponent vai bloquear a renderização via isLoading() de qualquer forma.
    if (this.isLoading()) return true;

    const subs = this.subscriptions();
    if (subs.length > 0) {
        const activeSub = subs.find(s => s.status === 'active' || s.status === 'trialing');
        if (activeSub) return true;
    }
    
    // Implicit Trial Fallback: if no valid subscription rows exist but the store is within 30 days
    if (this.implicitTrialDaysRemaining() > 0) return true;

    return false;
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
    if (sub && sub.status === 'trialing') return true;
    
    if (sub) {
        const plan = this.currentPlan();
        if (plan && plan.trial_period_days && plan.trial_period_days > 0 && sub.recurrent === false) {
          const createdAt = new Date(sub.created_at);
          const trialEndDate = new Date(createdAt);
          trialEndDate.setDate(trialEndDate.getDate() + plan.trial_period_days);
          return new Date() < trialEndDate;
        }
        return false;
    }
    
    // Implicit Trial Fallback
    return this.implicitTrialDaysRemaining() > 0;
  });

  trialDaysRemaining = computed(() => {
    const sub = this.subscription();
    
    if (!sub) {
        // Implicit Trial Fallback
        return this.implicitTrialDaysRemaining() > 0 ? this.implicitTrialDaysRemaining() : null;
    }
    
    if (!this.isTrialing()) return null;

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
    this.isLoading.set(false);
  }
}
