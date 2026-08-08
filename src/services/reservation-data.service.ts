import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { Reservation, ReservationSettings, ReservationStatus } from '../models/db.models';
import { AuthService } from './auth.service';
import { UnitContextService } from './unit-context.service';
import { ApiClientService } from './api-client.service';

@Injectable({
  providedIn: 'root',
})
export class ReservationDataService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);
  private apiClient = inject(ApiClientService);

  // --- Settings ---
  async getReservationSettings(): Promise<ReservationSettings | null> {
    const userId = this.unitContextService.activeUnitId();
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
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase.from('reservation_settings').upsert({ ...settings, user_id: userId }, { onConflict: 'user_id' });
    return { success: !error, error };
  }

  // --- Reservations (Internal Management) ---
  async updateReservationStatus(reservationId: string, status: ReservationStatus): Promise<{ success: boolean; error: any }> {
    const { error } = await this.apiClient.patch(`/api/v2/reservations?id=${reservationId}`, { status });
    return { success: !error, error };
  }

  async updateReservation(reservationId: string, reservationData: Partial<Reservation>): Promise<{ success: boolean; error: any }> {
    const { id, created_at, user_id, ...updateData } = reservationData;
    const { error } = await this.apiClient.patch(`/api/v2/reservations?id=${reservationId}`, updateData);
    return { success: !error, error };
  }

  async createManualReservation(reservationData: Partial<Reservation>): Promise<{ success: boolean; error: any }> {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await this.apiClient.post('/api/v2/reservations', {
      ...reservationData,
      status: 'CONFIRMED', // Staff-added reservations are confirmed by default
    });

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
    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

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
