import { Injectable, signal } from '@angular/core';
import { CompanyProfile, Reservation, ReservationSettings, LoyaltySettings, LoyaltyReward, Webhook } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class SettingsStateService {
  companyProfile = signal<CompanyProfile | null>(null);
  reservations = signal<Reservation[]>([]);
  reservationSettings = signal<ReservationSettings | null>(null);
  loyaltySettings = signal<LoyaltySettings | null>(null);
  loyaltyRewards = signal<LoyaltyReward[]>([]);
  // FIX: Add webhooks signal to hold webhook configurations
  webhooks = signal<Webhook[]>([]);

  clearData() {
    this.companyProfile.set(null);
    this.reservations.set([]);
    this.reservationSettings.set(null);
    this.loyaltySettings.set(null);
    this.loyaltyRewards.set([]);
    // FIX: Clear webhooks data on logout/data clear
    this.webhooks.set([]);
  }
}
