import { Component, ChangeDetectionStrategy, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { supabase } from '../../../services/supabase-client';

interface PlanFeature {
  name: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  popular: boolean;
  preapproval_plan_id: string;
}

@Component({
  selector: 'app-subscription-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionSettingsComponent implements OnInit {
  trialDaysRemaining = signal(2); // In a real app calculate from profile created_at + 30 days
  currentPlanStr = signal<'trial' | 'basic' | 'pro' | string>('trial');
  currentPlanName = signal('Kore Teste de 30 Dias');
  
  plans = signal<Plan[]>([]);
  isLoading = signal(true);
  isProcessing = signal(false);

  // Map of known permissions to readable labels
  permissionMap: Record<string, string> = {
    'pdv': 'PDV Base',
    'pdv_unlimited': 'PDVs Ilimitados',
    'kds': 'KDS (Monitor de Cozinha)',
    'ifood': 'Integração iFood',
    'reports': 'Relatórios Avançados',
    'inventory': 'Controle de Estoque Avançado',
    'multi_store': 'Múltiplas Lojas',
    'support_priority': 'Suporte Prioritário'
  };

  isModalOpen = signal(false);

  async ngOnInit() {
    await this.loadCurrentSubscription();
    await this.loadPlans();
  }

  async loadCurrentSubscription() {
     try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       
       const { data, error } = await supabase
         .from('subscriptions')
         .select('*, plans(name)')
         .eq('user_id', user.id)
         .eq('status', 'active')
         .maybeSingle();

       if (data && !error) {
          this.currentPlanStr.set(data.plan_id);
          this.currentPlanName.set(data.plans?.name || 'Plano Atual');
          this.trialDaysRemaining.set(0);
       }
     } catch(e) {
       console.error('Error fetching subscription in settings:', e);
     }
  }

  async loadPlans() {
    try {
      this.isLoading.set(true);
      
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });

      if (plansError) throw plansError;

      const { data: permissionsData, error: permError } = await supabase
        .from('plan_permissions')
        .select('*');

      if (permError) throw permError;

      const formattedPlans: Plan[] = (plansData || []).map(p => {
        const planPerms = (permissionsData || [])
          .filter(perm => perm.plan_id === p.id)
          .map(perm => perm.permission_key);

        const allKnownFeatures = Object.keys(this.permissionMap);
        const additionalPerms = planPerms.filter(k => !allKnownFeatures.includes(k));
        
        const featuresToShow = [...allKnownFeatures, ...additionalPerms].map(key => ({
          name: this.permissionMap[key] || this.formatPermissionKey(key),
          included: planPerms.includes(key)
        }));

        return {
          id: p.id,
          name: p.name,
          price: `R$ ${p.price?.toString().replace('.', ',')}`,
          period: p.recurring ? '/mês' : '',
          description: p.description || 'Plano ideal para o seu negócio',
          features: featuresToShow,
          popular: p.isMostPopular || false,
          preapproval_plan_id: p.preapproval_plan_id
        };
      });

      this.plans.set(formattedPlans);
    } catch (error) {
      console.error('Error loading plans in settings:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  formatPermissionKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  openUpgradeModal() {
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  async upgradePlan(plan: Plan) {
    this.isProcessing.set(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        alert('Você precisa estar logado para assinar.');
        this.isProcessing.set(false);
        return;
      }

      if (!plan.preapproval_plan_id) {
         setTimeout(() => {
            this.currentPlanStr.set(plan.id);
            this.currentPlanName.set(plan.name);
            this.trialDaysRemaining.set(0);
            this.closeModal();
            this.isProcessing.set(false);
            alert('Plano atualizado (Simulação)!');
         }, 1000);
         return;
      }

      const response = await fetch('/api/mercadopago-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.preapproval_plan_id,
          planName: plan.name,
          price: plan.price.replace('R$ ', '').replace(',', '.'),
          userEmail: user.email,
          userId: user.id
        })
      });

      const resData = await response.json();
      
      if (resData.init_point) {
        window.location.href = resData.init_point;
      } else {
        alert('Erro ao redirecionar para o Mercado Pago.');
        this.isProcessing.set(false);
      }

    } catch (e) {
      console.error('Error upgrading plan:', e);
      alert('Houve um erro ao processar a assinatura.');
      this.isProcessing.set(false);
    }
  }
}
