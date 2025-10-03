import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { Reservation, ReservationSettings, ReservationStatus } from '../models/db.models';
import { AuthService } from './auth.service';
import { WebhookService } from './webhook.service';

@Injectable({
  providedIn: 'root',
})
export class ReservationDataService {
  private authService = inject(AuthService);
  private webhookService = inject(WebhookService);

  // --- Settings ---
  async getReservationSettings(): Promise<ReservationSettings | null> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('reservation_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('Error fetching reservation settings:', error);
      return null;
    }
    return data;
  }

  async updateReservationSettings(settings: Partial<ReservationSettings>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase.from('reservation_settings').upsert({ ...settings, user_id: userId }, { onConflict: 'user_id' });
    return { success: !error, error };
  }

  // --- Reservations (Internal Management) ---
  async updateReservationStatus(reservationId: string, status: ReservationStatus): Promise<{ success: boolean; error: any }> {
    const { data: updatedReservation, error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', reservationId)
      .select()
      .single();
      
    if (updatedReservation && status === 'CONFIRMED') {
      this.webhookService.triggerWebhook('reserva.confirmada', updatedReservation);
    }
    
    return { success: !error, error };
  }

  async updateReservation(reservationId: string, reservationData: Partial<Reservation>): Promise<{ success: boolean; error: any }> {
    const { id, created_at, user_id, ...updateData } = reservationData;
    const { error } = await supabase.from('reservations').update(updateData).eq('id', reservationId);
    return { success: !error, error };
  }

  async createManualReservation(reservationData: Partial<Reservation>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: newReservation, error } = await supabase.from('reservations').insert({
      ...reservationData,
      user_id: userId,
      status: 'CONFIRMED', // Staff-added reservations are confirmed by default
    }).select().single();
    
    if (newReservation) {
      this.webhookService.triggerWebhook('reserva.confirmada', newReservation);
    }

    return { success: !error, error };
  }

  // --- Public Booking Methods ---
  async getPublicReservationSettings(userId: string): Promise<ReservationSettings | null> {
    const { data, error } = await supabase
      .from('reservation_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .single();
    if (error) {
      console.error('Error fetching public reservation settings:', error);
      return null;
    }
    return data;
  }

  async getReservationsForDay(userId: string, date: string): Promise<Reservation[]> {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('user_id', userId)
      .gte('reservation_time', startOfDay.toISOString())
      .lte('reservation_time', endOfDay.toISOString())
      .in('status', ['PENDING', 'CONFIRMED']);

    if (error) {
      console.error('Error fetching reservations for day:', error);
      return [];
    }
    return data || [];
  }

  async createPublicReservation(reservation: Omit<Reservation, 'id' | 'created_at' | 'status'>): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('reservations').insert({
      ...reservation,
      status: 'PENDING',
    });
    return { success: !error, error };
  }
}