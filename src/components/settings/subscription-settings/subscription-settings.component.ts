import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-subscription-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionSettingsComponent {
  trialDaysRemaining = signal(2); // Simulated trial remaining
  currentPlan = signal<'trial' | 'basic' | 'pro'>('trial');
  
  plans = [
    {
      id: 'basic',
      name: 'Plano Básico',
      price: 'R$ 99,00',
      period: '/mês',
      description: 'Ideal para pequenos comércios iniciando',
      features: [
        { name: '1 PDV Incluso', included: true },
        { name: 'Controle de Estoque Básico', included: true },
        { name: 'Relatórios Mensais', included: true },
        { name: 'Integração iFood', included: false },
        { name: 'KDS (Monitor de Cozinha)', included: false },
        { name: 'Múltiplas Lojas', included: false },
        { name: 'Suporte Prioritário 24/7', included: false },
      ],
      popular: false
    },
    {
      id: 'pro',
      name: 'Plano PRO',
      price: 'R$ 199,00',
      period: '/mês',
      description: 'Perfeito para restaurantes em crescimento',
      features: [
        { name: 'PDVs Ilimitados', included: true },
        { name: 'Controle de Estoque Avançado', included: true },
        { name: 'Relatórios em Tempo Real', included: true },
        { name: 'Integração iFood', included: true },
        { name: 'KDS (Monitor de Cozinha)', included: true },
        { name: 'Até 5 Lojas', included: true },
        { name: 'Suporte Prioritário 24/7', included: true },
      ],
      popular: true
    }
  ];

  isModalOpen = signal(false);

  openUpgradeModal() {
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  upgradePlan(planId: string) {
    // In a real app, integrate with payment gateway
    this.currentPlan.set(planId as any);
    this.trialDaysRemaining.set(0);
    this.closeModal();
    alert('Plano atualizado com sucesso!');
  }
}
