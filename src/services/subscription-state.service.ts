import { Injectable, signal, computed } from '@angular/core';
import { Subscription, Plan } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  plans = signal<Plan[]>([]);
  subscriptions = signal<Subscription[]>([]);
  activeUserPermissions = signal<Set<string>>(new Set());

  hasActiveSubscription = computed(() => {
    const subs = this.subscriptions();
    if (subs.length === 0) return false; 
    return subs.some(s => s.status === 'active' || s.status === 'trialing');
  });

  subscription = computed(() => this.subscriptions()[0] ?? null);
  
  currentPlan = computed(() => {
    const sub = this.subscription();
    const plans = this.plans();
    if (!sub) return null;
    return plans.find(p => p.id === sub.plan_id) ?? null;
  });

  isTrialing = computed(() => {
    const subs = this.subscriptions();
    if (subs.length === 0) return false;

    const userSub = subs[0];
    if (!userSub) return false;

    if (userSub.status === 'trialing') {
      return true;
    }
    
    const plansMap = new Map(this.plans().map(p => [p.id, p]));
    const subPlan = plansMap.get(userSub.plan_id);
    
    if (subPlan && subPlan.trial_period_days && subPlan.trial_period_days > 0 && userSub.recurrent === false) {
      const createdAt = new Date(userSub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + subPlan.trial_period_days);
      
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
    
    const plansMap = new Map(this.plans().map(p => [p.id, p]));
    const subPlan = plansMap.get(sub.plan_id);

    if (subPlan && subPlan.trial_period_days && sub.recurrent === false) {
      const createdAt = new Date(sub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + subPlan.trial_period_days);
      
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
  }
}
