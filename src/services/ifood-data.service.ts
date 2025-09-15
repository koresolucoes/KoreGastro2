import { Injectable } from '@angular/core';
import { IfoodOrderStatus } from '../models/db.models';

@Injectable({
  providedIn: 'root'
})
export class IfoodDataService {

  constructor() { }

  /**
   * Simulates sending a status update to the iFood API.
   * In a real application, this would be an HTTP POST request with authentication.
   * @param ifoodOrderId The unique ID of the order on the iFood platform.
   * @param status The new status to be sent.
   * @param details Optional details, e.g., cancellation reason.
   */
  async sendStatusUpdate(ifoodOrderId: string, status: IfoodOrderStatus, details?: any): Promise<{ success: boolean; error: any }> {
    console.log(
      `[MOCK iFood API Call] Updating order ${ifoodOrderId} to status ${status} with details:`, 
      details || 'No details'
    );
    
    // Simulate a network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // In a real scenario, you would handle the response from the iFood API.
    // For this mock, we always assume success.
    return { success: true, error: null };
  }
}
