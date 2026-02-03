
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Subscription, Plan } from '../models/db.models';
import { DemoService } from './demo.service';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
import { UnitContextService } from './unit-context.service';
import { supabase } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  private demoService = inject(DemoService);
  private unitContextService = inject(UnitContextService);
  
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
      // 1. Identify the OWNER of the current store
      const { data: store, error: storeError } = await supabase
          .from('stores')
          .select('owner_id')
          .eq('id', storeId)
          .single();

      // If store table not found or error (maybe single store legacy mode), assume auth user is owner or fallback
      let ownerId = store?.owner_id;
      
      // Fallback for legacy single-store setup where store_id might be the user_id itself
      if (!ownerId) {
          // If we can't find the store in 'stores' table, assume the ID itself is the user ID (legacy matrix)
          ownerId = storeId;
      }

      if (ownerId) {
          // 2. Fetch Active Subscriptions for this OWNER
          const { data: subs, error: subError } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', ownerId)
              .in('status', ['active', 'trialing'])
              .order('created_at', { ascending: false });

          if (subs) {
             this.subscriptions.set(subs);
          }
          
          // 3. Count total stores owned by this user to check against max_stores
          const { count, error: countError } = await supabase
            .from('stores')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', ownerId);
            
          this.ownerStoreCount.set(count || 1); // Default to 1 if count fails or is 0
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
            // For now, let's return true but maybe the UI should warn "Upgrade needed".
            // Implementation Decision: If strict, return false. But usually, SaaS allows overage or blocks creation.
            // Let's assume validity if subscription exists, but logic to block creation of NEW stores should handle the limit.
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
