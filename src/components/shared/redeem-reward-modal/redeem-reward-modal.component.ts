import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Customer, LoyaltyReward, Recipe } from '../../../models/db.models';
import { SupabaseStateService } from '../../../services/supabase-state.service';
import { PosDataService } from '../../../services/pos-data.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-redeem-reward-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './redeem-reward-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedeemRewardModalComponent {
  private stateService = inject(SupabaseStateService);
  private posDataService = inject(PosDataService);
  private notificationService = inject(NotificationService);
  
  customer: InputSignal<Customer | undefined | null> = input.required<Customer | undefined | null>();
  orderId: InputSignal<string | undefined | null> = input.required<string | undefined | null>();

  closeModal: OutputEmitterRef<void> = output<void>();

  isRedeeming = signal<string | null>(null); // holds rewardId being redeemed

  availableRewards = this.stateService.loyaltyRewards;
  recipesById = this.stateService.recipesById;

  redeemableRewards = computed(() => {
    const cust = this.customer();
    if (!cust) return [];
    
    return this.availableRewards().map(reward => ({
      ...reward,
      canRedeem: cust.loyalty_points >= reward.points_cost
    }));
  });

  getRewardValueLabel(reward: LoyaltyReward): string {
    if (reward.reward_type === 'free_item') {
      return this.recipesById().get(reward.reward_value)?.name || 'Item não encontrado';
    }
    if (reward.reward_type === 'discount_percentage') {
        return `${reward.reward_value}%`;
    }
    return `R$ ${reward.reward_value}`;
  }

  async redeemReward(rewardId: string) {
    const cust = this.customer();
    const ordId = this.orderId();
    if (!cust || !ordId) return;

    this.isRedeeming.set(rewardId);
    
    const { success, error, message } = await this.posDataService.redeemReward(cust.id, rewardId, ordId);
    
    if (success) {
      await this.notificationService.alert(message || 'Prêmio resgatado com sucesso!', 'Sucesso');
      this.closeModal.emit();
    } else {
      await this.notificationService.alert(message || `Erro ao resgatar prêmio: ${error?.message}`);
    }
    
    this.isRedeeming.set(null);
  }
}