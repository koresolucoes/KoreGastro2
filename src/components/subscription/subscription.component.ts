import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionComponent {
  private router = inject(Router);

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

  isProcessing = signal(false);

  subscribe(planId: string) {
    this.isProcessing.set(true);
    // Simulate integration
    setTimeout(() => {
      this.isProcessing.set(false);
      alert('Assinatura ativada com sucesso! Bem-vindo(a) ao Kore!');
      this.router.navigate(['/home']);
    }, 1500);
  }
}
