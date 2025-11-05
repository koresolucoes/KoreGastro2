import { Injectable } from '@angular/core';
import { IfoodOrderStatus } from '../models/db.models';

@Injectable({
  providedIn: 'root'
})
export class IfoodDataService {

  /**
   * Sends a status update to our backend proxy, which then securely communicates with the iFood API.
   * @param ifoodOrderId The unique ID of the order on the iFood platform.
   * @param status The new status to be sent.
   * @param details Optional details, e.g., cancellation reason.
   */
  async sendStatusUpdate(ifoodOrderId: string, status: IfoodOrderStatus, details?: any): Promise<{ success: boolean; error: any }> {
    try {
      let action: string | null = null;
      let bodyDetails: any = details;

      switch (status) {
        case 'CONFIRMED':
          action = 'confirm';
          break;
        case 'IN_PREPARATION':
          // This iFood status is implicit after confirming the order.
          // No direct API call is needed, so we return success immediately.
          return { success: true, error: null };
        case 'DISPATCHED':
          action = 'dispatch';
          break;
        case 'READY_FOR_PICKUP':
          action = 'readyToPickup';
          break;
        case 'CANCELLED':
          action = 'cancel';
          // Standardize the details payload for the proxy
          bodyDetails = {
            reason: details?.reason || 'CANCELAMENTO SOLICITADO PELO RESTAURANTE',
            code: details?.code || '501' // Generic cancellation by restaurant
          };
          break;
        default:
          console.warn(`Unsupported iFood status update requested: ${status}. No action taken.`);
          // Return success as there's no action to fail on.
          return { success: true, error: null };
      }

      if (!action) {
        return { success: false, error: { message: `No valid action found for status ${status}` } };
      }

      const response = await fetch('https://gastro.koresolucoes.com.br/api/ifood-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          orderId: ifoodOrderId,
          details: bodyDetails
        })
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Proxy error (${response.status})`);
      }
      
      console.log(`Successfully sent update via proxy for order ${ifoodOrderId} with status ${status}.`);
      return { success: true, error: null };

    } catch (error) {
      console.error(`Error sending iFood status update via proxy for order ${ifoodOrderId}:`, error);
      return { success: false, error };
    }
  }

  async sendLogisticsAction(ifoodOrderId: string, action: string, details?: any): Promise<{ success: boolean; error: any, data?: any }> {
    try {
       const response = await fetch('https://gastro.koresolucoes.com.br/api/ifood-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          orderId: ifoodOrderId,
          isLogistics: true, // Flag to differentiate from order status actions
          details: details
        })
      });

      const responseBody = await response.json();

      if (!response.ok) {
        throw new Error(responseBody.message || `Proxy error (${response.status})`);
      }
      
      console.log(`Successfully sent logistics action '${action}' for order ${ifoodOrderId}.`);
      return { success: true, error: null, data: responseBody };
    } catch (error) {
       console.error(`Error sending iFood logistics action '${action}' for order ${ifoodOrderId}:`, error);
      return { success: false, error };
    }
  }

  async sendDisputeAction(disputeId: string, action: 'acceptDispute' | 'rejectDispute', details?: any): Promise<{ success: boolean; error: any }> {
    try {
      const response = await fetch('https://gastro.koresolucoes.com.br/api/ifood-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          disputeId,
          isDispute: true,
          details
        })
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Proxy error (${response.status})`);
      }

      console.log(`Successfully sent dispute action '${action}' for dispute ${disputeId}.`);
      return { success: true, error: null };

    } catch (error) {
      console.error(`Error sending iFood dispute action '${action}' for dispute ${disputeId}:`, error);
      return { success: false, error };
    }
  }
}