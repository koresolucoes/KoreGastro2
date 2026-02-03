
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Subscription, Plan } from '../models/db.models';
import { DemoService } from './demo.service';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
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

  // Novo estado para controlar contagem de lojas do dono
  ownerStoreCount = signal<number>(0);

  constructor() {
      // Effect to load subscription logic when the active unit changes
      effect(async () => {
          const activeUnitId = this.unitContextService.activeUnitId();
          if (activeUnitId && !this.demoService.isDemoMode()) {
              await this.loadSubscriptionForUnit(activeUnitId);
          }
      }, { allowSignalWrites: true });
  }

  async loadSubscriptionForUnit(storeId: string) {
      console.log(`[Subscription] Verificando assinatura para a Loja: ${storeId}`);
      let ownerId: string | null = null;

      // 1. Tentativa Direta: Ler tabela 'stores'
      const { data: store, error: storeError } = await supabase
          .from('stores')
          .select('owner_id')
          .eq('id', storeId)
          .single();

      if (store?.owner_id) {
          ownerId = store.owner_id;
          console.log(`[Subscription] Dono identificado via tabela stores: ${ownerId}`);
      } else {
          console.warn('[Subscription] Falha ao ler owner_id da tabela stores. Tentando método alternativo...', storeError);

          // 2. Tentativa via Permissões: Quem é o 'owner' desta loja nas permissões?
          // Nota: Isso pode falhar se o usuário atual não puder ver quem é o dono (RLS), mas vale tentar.
          const { data: perm } = await supabase
              .from('unit_permissions')
              .select('manager_id')
              .eq('store_id', storeId)
              .eq('role', 'owner')
              .maybeSingle();
          
          if (perm?.manager_id) {
              ownerId = perm.manager_id;
              console.log(`[Subscription] Dono identificado via permissões: ${ownerId}`);
          } else {
              // 3. Tentativa via Usuário Logado (Se eu sou o dono, a assinatura é minha)
              // Verificamos se temos permissão de 'owner' localmente no UnitContext
              const myUnits = this.unitContextService.availableUnits();
              const currentUnitContext = myUnits.find(u => u.id === storeId);
              
              if (currentUnitContext && currentUnitContext.role === 'owner') {
                  const currentUser = this.authService.currentUser();
                  if (currentUser) {
                      ownerId = currentUser.id;
                      console.log(`[Subscription] Usuário atual identificado como dono pelo contexto: ${ownerId}`);
                  }
              }
          }
      }
      
      // 4. Fallback Legado (Single Store): O ID da loja é o ID do usuário
      if (!ownerId) {
          console.warn('[Subscription] Não foi possível determinar o dono. Usando ID da loja como fallback (modo legado).');
          ownerId = storeId;
      }

      if (ownerId) {
          // Fetch Active Subscriptions for this OWNER
          const { data: subs, error: subError } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', ownerId)
              .in('status', ['active', 'trialing'])
              .order('created_at', { ascending: false });

          if (subError) {
              console.error('[Subscription] Erro ao buscar assinaturas:', subError);
          }

          if (subs && subs.length > 0) {
             console.log(`[Subscription] Assinatura ativa encontrada para o dono ${ownerId}. Plano: ${subs[0].plan_id}`);
             this.subscriptions.set(subs);
          } else {
             console.warn(`[Subscription] Nenhuma assinatura ativa encontrada para o dono ${ownerId}.`);
             this.subscriptions.set([]); // Garante que limpa se não achar
          }
          
          // Count total stores owned by this user
          // Se falhar a leitura de stores acima, isso também pode falhar, então usamos count seguro
          const { count, error: countError } = await supabase
            .from('stores')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', ownerId);
            
          this.ownerStoreCount.set(count || 1);
      }
  }

  hasActiveSubscription = computed(() => {
    if (this.demoService.isDemoMode()) {
      return true;
    }
    const subs = this.subscriptions();
    if (subs.length === 0) return false;
    
    // Get the first active/trialing subscription
    const activeSub = subs.find(s => s.status === 'active' || s.status === 'trialing');
    if (!activeSub) return false;

    // Check Max Stores Limit
    const plan = this.plans().find(p => p.id === activeSub.plan_id);
    if (plan) {
        // If plan has a max_stores limit, check if owner is within limit
        if (plan.max_stores && this.ownerStoreCount() > plan.max_stores) {
            console.warn(`Plan limit exceeded. Max: ${plan.max_stores}, Current: ${this.ownerStoreCount()}`);
            // Strictly speaking, we might want to return false here, OR just warn. 
            return true;
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
    if (this.demoService.isDemoMode()) {
      return false;
    }
    const subs = this.subscriptions();
    if (subs.length === 0) return false;

    const userSub = subs[0];
    if (!userSub) return false;

    if (userSub.status === 'trialing') {
      return true;
    }
    
    const plansMap = new Map<string, Plan>(this.plans().map(p => [p.id, p]));
    const subPlan = plansMap.get(userSub.plan_id);
    
    if (subPlan && subPlan.trial_period_days && subPlan.trial_period_days > 0 && userSub.recurrent === false) {
      const createdAt = new Date(userSub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + subPlan.trial_period_days!);
      
      return new Date() < trialEndDate;
    }
    
    return false;
  });

  trialDaysRemaining = computed(() => {
    const sub = this.subscription();
    if (!this.isTrialing() || !sub) {
        return null;
    }

    if (sub.status === 'trialing' && sub.current_period_end) {
        const endDate = new Date(sub.current_period_end);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        if (diffTime < 0) return 0;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
    
    const plansMap = new Map<string, Plan>(this.plans().map(p => [p.id, p]));
    const subPlan = plansMap.get(sub.plan_id);

    if (subPlan && subPlan.trial_period_days && sub.recurrent === false) {
      const createdAt = new Date(sub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + subPlan.trial_period_days!);
      
      const now = new Date();
      const diffTime = trialEndDate.getTime() - now.getTime();
      if (diffTime < 0) return 0;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    }

    return 0; // Fallback
  });

  clearData() {
    this.plans.set([]);
    this.subscriptions.set([]);
    this.activeUserPermissions.set(new Set());
    this.ownerStoreCount.set(0);
  }
}
