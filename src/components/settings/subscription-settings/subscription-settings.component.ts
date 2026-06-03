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
    '/Whatsapp': 'Automação e Atendimento via WhatsApp',
    '/Cashier': 'Controle de Caixa Intuitivo',
    '/Customers': 'CRM e Fidelidade de Clientes',
    '/Dashboard': 'Painel Gerencial e Métricas em Tempo Real',
    '/Employees': 'Gestão Completa da Equipe',
    '/Ifood-Kds': 'Integração de Pedidos iFood Direto na Cozinha (KDS)',
    '/Ifood-Menu': 'Gestão Unificada de Cardápio iFood',
    '/Ifood-Store-Manager': 'Gerenciamento de Loja iFood',
    '/Inventory': 'Controle de Estoque e Matéria-Prima',
    '/Kds': 'Monitores de Produção (KDS) Interativos',
    '/Leave-Management': 'Controle de Licenças e Faltas',
    '/Menu': 'Engenharia e Gestão de Cardápio',
    '/Mise-En-Place': 'Gestão de Produção e Mise-En-Place',
    '/My-Leave': 'Portal de Licenças da Equipe',
    '/Payroll': 'Fechamento de Folha de Pagamento (RH)',
    '/Performance': 'Avaliação de Desempenho e Metas',
    '/Pos': 'PDV Frente de Caixa Ultrarrápido',
    '/Purchasing': 'Central Inteligente de Compras',
    '/Reports': 'Relatórios Gerenciais Aprofundados',
    '/Reservations': 'Controle Dinâmico de Reservas de Mesas',
    '/Schedules': 'Módulo de Escalas e Jornada de Trabalho',
    '/Settings': 'Painel de Configurações do Sistema',
    '/Suppliers': 'Catálogo Integrado de Fornecedores',
    '/Technical-Sheets': 'Fichas Técnicas de Receitas',
    '/Time-Clock': 'Relógio de Ponto Eletrônico Integrado',
    '/Tutorials': 'Academia VIP e Tutoriais Interativos',
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

        const featuresToShow = planPerms.map(key => {
          const found = Object.keys(this.permissionMap).find(k => k.toLowerCase() === key.toLowerCase());
          return {
             name: found ? this.permissionMap[found] : this.formatPermissionKey(key),
             included: true
          };
        });

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
    return key.replace(/[\/-]/g, ' ').trim().replace(/\b\w/g, l => l.toUpperCase());
  }

  openUpgradeModal() {
    this.isModalOpen.set(true);
  }

  manageSubscription() {
    // We open the modal so they can see plans and downgrade/upgrade. 
    // If they click on their current plan again, we handle it or give a message.
    this.openUpgradeModal();
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

      const response = await fetch('/api/mercadopago-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id, // Envia o ID interno do plano
          planName: plan.name,
          price: plan.price.replace('R$ ', '').replace('.', '').replace(',', '.'),
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
