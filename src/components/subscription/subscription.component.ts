import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { supabase } from '../../services/supabase-client';

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
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionComponent implements OnInit {
  private router = inject(Router);

  plans = signal<Plan[]>([]);
  isProcessing = signal(false);
  isLoading = signal(true);

  // Map of known permissions to readable labels
  permissionMap: Record<string, string> = {
    'pdv': 'Ponto de Venda (PDV) ultrarrápido',
    'pdv_unlimited': 'Múltiplos PDVs ilimitados',
    'kds': 'Telas de Produção na Cozinha (KDS)',
    'ifood': 'Integração inteligente com iFood',
    'reports': 'Relatórios e dashboard gerencial',
    'inventory': 'Controle completo de compras e estoque',
    'multi_store': 'Gerenciamento de múltiplas filiais',
    'support_priority': 'Suporte técnico VIP 24h',
    'menu_builder': 'Cardápio digital e via QR Code',
    'kitchen_kds': 'Organização e sincronia com a cozinha'
  };

  async ngOnInit() {
    await this.loadPlans();
  }

  async loadPlans() {
    try {
      this.isLoading.set(true);
      
      // Fetch plans
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });

      if (plansError) throw plansError;

      // Fetch plan permissions
      const { data: permissionsData, error: permError } = await supabase
        .from('plan_permissions')
        .select('*');

      if (permError) throw permError;

      const formattedPlans: Plan[] = (plansData || []).map(p => {
        // Find permissions for this plan
        const planPerms = (permissionsData || [])
          .filter(perm => perm.plan_id === p.id)
          .map(perm => perm.permission_key);

        // Build feature list. For simplicity, we check a base list of features.
        const allKnownFeatures = Object.keys(this.permissionMap);
        
        // If the plan has permissions that we don't know about, we add them too
        const additionalPerms = planPerms.filter(k => !allKnownFeatures.includes(k));
        
        // Combine features to show
        const featuresToShow = [...allKnownFeatures, ...additionalPerms].map(key => {
          return {
            name: this.permissionMap[key] || this.formatPermissionKey(key),
            included: planPerms.includes(key)
          };
        });

        // Some logical fallbacks if a plan has no permissions mapped
        if (planPerms.length === 0 && featuresToShow.length === Object.keys(this.permissionMap).length) {
            // Assume basic includes only pdv if nothing is returned, just as fallback
        }

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

      // If database is empty, provide default mock
      if (formattedPlans.length === 0) {
        this.plans.set([{
          id: 'mock',
          name: 'Plano Básico (Mock)',
          price: 'R$ 99,00',
          period: '/mês',
          description: 'Nenhum plano cadastrado no banco de dados.',
          features: [
            { name: '1 PDV Incluso', included: true }
          ],
          popular: true,
          preapproval_plan_id: ''
        }]);
      } else {
        this.plans.set(formattedPlans);
      }

    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  formatPermissionKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  async subscribe(plan: Plan) {
    this.isProcessing.set(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        alert('Você precisa estar logado para assinar.');
        this.isProcessing.set(false);
        return;
      }

      // If there's no preapproval_plan_id, it might just be a manual plan or mock.
      if (!plan.preapproval_plan_id) {
         // Fake integration if no MP plan
         setTimeout(() => {
            this.isProcessing.set(false);
            alert('Assinatura ativada (Modo Simulação)!');
            this.router.navigate(['/home']);
         }, 1000);
         return;
      }

      const response = await fetch('/api/mercadopago-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.preapproval_plan_id, // Send the preapproval_plan_id to MP
          planName: plan.name,
          price: plan.price.replace('R$ ', '').replace(',', '.'), // Normalize price
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
      console.error('Error subscribing:', e);
      alert('Houve um erro ao processar a assinatura.');
      this.isProcessing.set(false);
    }
  }
}
