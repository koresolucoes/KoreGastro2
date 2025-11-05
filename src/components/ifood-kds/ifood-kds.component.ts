import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy, untracked, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IfoodStateService } from '../../services/ifood-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { IfoodDataService } from '../../services/ifood-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { Order, OrderItem, IfoodOrderStatus, OrderItemStatus, OrderStatus, IfoodWebhookLog } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';
import { SoundNotificationService } from '../../services/sound-notification.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodMenuService, IfoodCancellationReason, IfoodTrackingData } from '../../services/ifood-menu.service';
import { CancelIfoodOrderModalComponent } from './cancel-ifood-order-modal/cancel-ifood-order-modal.component';
import { IfoodTrackingModalComponent } from './ifood-tracking-modal/ifood-tracking-modal.component';
import { RejectDisputeModalComponent } from './reject-dispute-modal/reject-dispute-modal.component';
import { VerifyCodeModalComponent } from './verify-code-modal/verify-code-modal.component';
import { OrderDetailsModalComponent } from './order-details-modal/order-details-modal.component';
import { AssignDriverModalComponent } from './assign-driver-modal/assign-driver-modal.component';
import { ProposeRefundModalComponent } from './propose-refund-modal/propose-refund-modal.component';
import { ProcessedIfoodOrder, LogisticsStatus } from '../../models/app.models';


@Component({
  selector: 'app-ifood-kds',
  standalone: true,
  imports: [CommonModule, CancelIfoodOrderModalComponent, FormsModule, IfoodTrackingModalComponent, RejectDisputeModalComponent, VerifyCodeModalComponent, OrderDetailsModalComponent, AssignDriverModalComponent, ProposeRefundModalComponent],
  templateUrl: './ifood-kds.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodKdsComponent implements OnInit, OnDestroy {
  ifoodState = inject(IfoodStateService);
  posState = inject(PosStateService);
  ifoodDataService = inject(IfoodDataService);
  posDataService = inject(PosDataService);
  notificationService = inject(NotificationService);
  soundNotificationService = inject(SoundNotificationService);
  supabaseStateService = inject(SupabaseStateService);
  ifoodMenuService = inject(IfoodMenuService);

  private timerInterval: any;
  currentTime = signal(Date.now());
  
  private processedNewOrders = signal<Set<string>>(new Set());
  private processedDisputeIds = signal<Set<string>>(new Set());
  private alertedForPrep = signal<Set<string>>(new Set());
  
  // State for webhook logs
  isLogVisible = signal(false);
  webhookLogs = computed(() => 
    this.ifoodState.ifoodWebhookLogs()
      .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  );
  selectedLogForDetail = signal<IfoodWebhookLog | null>(null);

  // New state for UI interactions
  updatingOrders = signal<Set<string>>(new Set());
  isDetailModalOpen = signal(false);
  selectedOrderForDetail = signal<ProcessedIfoodOrder | null>(null);

  // New state for logistics modals
  isAssignDriverModalOpen = signal(false);
  orderForDriverModal = signal<ProcessedIfoodOrder | null>(null);
  
  // New state for cancellation modal
  isCancelModalOpen = signal(false);
  orderToCancel = signal<ProcessedIfoodOrder | null>(null);
  cancellationReasons = signal<IfoodCancellationReason[]>([]);
  isLoadingCancellationReasons = signal(false);

  // New state for dispute modal
  isRejectDisputeModalOpen = signal(false);
  orderToReject = signal<ProcessedIfoodOrder | null>(null);

  // New state for code verification modal
  isVerifyCodeModalOpen = signal(false);
  orderForCodeModal = signal<ProcessedIfoodOrder | null>(null);
  codeTypeForModal = signal<'pickup' | 'delivery' | null>(null);

  // Tracking Modal State
  isTrackingModalOpen = signal(false);
  isLoadingTracking = signal(false);
  trackingData = signal<IfoodTrackingData | null>(null);
  orderForTracking = signal<ProcessedIfoodOrder | null>(null);

  // Propose Refund Modal State
  isProposeRefundModalOpen = signal(false);
  orderToProposeRefund = signal<ProcessedIfoodOrder | null>(null);
  refundAmount = signal(0);


  constructor() {
    effect(() => {
        const orders = this.processedOrders();
        const currentOrderIds = new Set(orders.map(o => o.id));
        
        untracked(() => {
            const previouslyProcessed = this.processedNewOrders();
            const previouslyAlertedForPrep = this.alertedForPrep();
            const now = Date.now();

            for(const order of orders) {
                // New order sound (only if not a future scheduled order)
                if (!previouslyProcessed.has(order.id) && order.ifoodStatus === 'RECEIVED' && !order.isScheduledAndHeld) {
                    this.soundNotificationService.playNewOrderSound();
                }
                
                // Time to prepare sound
                if (order.ifood_order_timing === 'SCHEDULED' && order.ifood_scheduled_at && !previouslyAlertedForPrep.has(order.id)) {
                    const prepTime = new Date(order.ifood_scheduled_at).getTime();
                    // Alert 1 minute before prep time until 1 minute after
                    if (now >= (prepTime - 60000) && now < (prepTime + 60000)) {
                        this.soundNotificationService.playAllergyAlertSound(); // Use an urgent sound
                        this.notificationService.show(`Hora de preparar o pedido agendado #${order.ifood_display_id}!`, 'info', 10000);
                        previouslyAlertedForPrep.add(order.id);
                    }
                }
            }
            this.processedNewOrders.set(currentOrderIds);
            this.alertedForPrep.set(previouslyAlertedForPrep);
        });
    });

    effect(() => {
      const ordersWithDisputes = this.processedOrders().filter(o => !!o.ifood_dispute_id);
      const currentDisputeIds = new Set(ordersWithDisputes.map(o => o.ifood_dispute_id!));

      untracked(() => {
        const previouslyProcessed = this.processedDisputeIds();
        
        for (const disputeId of currentDisputeIds) {
          if (!previouslyProcessed.has(disputeId)) {
            console.log(`New dispute detected: ${disputeId}. Playing sound.`);
            this.soundNotificationService.playAllergyAlertSound(); // Use an urgent sound
          }
        }
      });
      
      this.processedDisputeIds.set(currentDisputeIds);
    });
  }

  ngOnInit(): void {
    this.timerInterval = setInterval(() => this.currentTime.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
  
  // Helper functions for the template to avoid complex logic
  hasRefundAlternative(order: ProcessedIfoodOrder): boolean {
    return !!order.ifood_dispute_details?.alternatives?.some((alt: any) => alt.type === 'REFUND');
  }

  getRefundAlternative(order: ProcessedIfoodOrder): any | undefined {
    return order.ifood_dispute_details?.alternatives?.find((alt: any) => alt.type === 'REFUND');
  }

  hasAdditionalTimeAlternative(order: ProcessedIfoodOrder): boolean {
    return !!order.ifood_dispute_details?.alternatives?.some((alt: any) => alt.type === 'ADDITIONAL_TIME');
  }
  
  getDisputeMessage(order: ProcessedIfoodOrder | null): string | null {
    if (!order || !order.ifood_dispute_details) {
      return null;
    }
    
    let details = order.ifood_dispute_details;
    
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch (e) {
        console.error('Could not parse ifood_dispute_details string:', e);
        return null;
      }
    }
    
    // Check if it's an object and has a truthy 'message' property
    if (details && typeof details === 'object' && 'message' in details && details.message) {
      return details.message;
    }
    
    return null;
  }

  private getIfoodStatus(order: Order): IfoodOrderStatus {
    let details: any = order.ifood_dispute_details;
    if (details && typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch (e) {
        console.error("Failed to parse ifood_dispute_details", e);
        details = null; 
      }
    }
  
    // If it's an after delivery dispute, it's always in 'RECEIVED' state for KDS purposes to show the dispute actions.
    if (details?.handshakeType === 'AFTER_DELIVERY') {
      return 'RECEIVED';
    }
  
    if (order.status === 'CANCELLED') {
      return 'CANCELLED';
    }
  
    const items = order.order_items || [];
    if (items.length === 0) {
      return 'RECEIVED';
    }
  
    const allReadyOrServed = items.every(i => i.status === 'PRONTO' || i.status === 'SERVIDO');
    if (allReadyOrServed) {
      return order.order_type === 'iFood-Delivery' ? 'DISPATCHED' : 'READY_FOR_PICKUP';
    }
  
    const hasPreparing = items.some(i => i.status === 'EM_PREPARO');
    if (hasPreparing) {
      return 'IN_PREPARATION';
    }
    
    // If not preparing and not all ready, it means at least one item is PENDENTE.
    return 'RECEIVED';
  }
  
  private getLogisticsStatus(order: Order, logs: IfoodWebhookLog[]): LogisticsStatus | null {
    if (order.delivery_info?.deliveredBy !== 'IFOOD') {
        return null;
    }

    const relevantLogs = logs
        .filter(log => log.ifood_order_id === order.ifood_order_id && log.event_code)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const latestStatusLog = relevantLogs.find(log => 
        ['ASSIGNED_DRIVER', 'GOING_TO_ORIGIN', 'ARRIVED_AT_ORIGIN', 'DISPATCHED', 'ARRIVED_AT_DESTINATION'].includes(log.event_code!)
    );

    if (latestStatusLog) {
        switch(latestStatusLog.event_code) {
            case 'ASSIGNED_DRIVER': return 'ASSIGNED';
            case 'GOING_TO_ORIGIN': return 'GOING_TO_ORIGIN';
            case 'ARRIVED_AT_ORIGIN': return 'ARRIVED_AT_ORIGIN';
            case 'DISPATCHED': return 'DISPATCHED_TO_CUSTOMER';
            case 'ARRIVED_AT_DESTINATION': return 'ARRIVED_AT_DESTINATION';
        }
    }
    
    const allItemsReady = (order.order_items || []).every(i => i.status === 'PRONTO' || i.status === 'SERVIDO');
    if (allItemsReady) {
        return 'AWAITING_DRIVER';
    }

    return null;
  }

  private getPaymentDetails(order: Order): { paymentDetails: string; changeDue: number } {
    const paymentData = order.ifood_payments as any;
    let paymentDetails = '';
    let changeDue = 0;
  
    if (!paymentData) {
      return { paymentDetails: 'Não informado', changeDue };
    }
  
    // Handle both old structure (just payments object) and new structure ({ payments: ..., total: ... })
    const payments = paymentData?.payments || paymentData;
    const isPrepaid = payments?.methods?.some((p: any) => p.prepaid === true) || false;

    paymentDetails = isPrepaid ? 'Pago Online' : 'Pago na Entrega';
    
    let paymentMethodsSource: any[] = [];
    if (payments && Array.isArray(payments.methods)) {
      paymentMethodsSource = payments.methods;
    } else if (Array.isArray(payments)) { // Fallback for older structures that were just an array
      paymentMethodsSource = payments;
    }
  
    if (paymentMethodsSource.length > 0) {
      const methodDescriptions = paymentMethodsSource.map(p => {
        const methodType = p.method || p.name || 'OUTRO';
        let description = '';
        switch (methodType.toUpperCase()) {
          case 'CREDIT': description = 'Crédito'; break;
          case 'DEBIT': description = 'Débito'; break;
          case 'CASH': description = 'Dinheiro'; break;
          case 'MEAL_VOUCHER': description = 'Vale Refeição'; break;
          case 'FOOD_VOUCHER': description = 'Vale Alimentação'; break;
          case 'PIX': description = 'PIX'; break;
          default: description = methodType;
        }

        if (p.card && p.card.brand) {
          description += ` (${p.card.brand})`;
        }
        return description;
      }).filter(Boolean); // Filter out any null/undefined descriptions

      if (methodDescriptions.length > 0) {
        paymentDetails += ` - ${methodDescriptions.join(', ')}`;
      }

      const cashPayment = paymentMethodsSource.find(p => p.method === 'CASH');
      if (cashPayment && cashPayment.cash?.changeFor) {
        changeDue = cashPayment.cash.changeFor;
      }
    }
  
    return { paymentDetails, changeDue };
  }

  private getOrderTotalAmount(order: Order): number {
    const paymentData = order.ifood_payments as any;

    // Prioritize the reliable `orderAmount` from the new structure
    if (paymentData && paymentData.total && typeof paymentData.total.orderAmount === 'number') {
        return paymentData.total.orderAmount;
    }

    // Fallback for old data structure or if `total` object is missing
    const payments = paymentData?.payments || paymentData; 
    
    if (!payments) {
        // Fallback to item sum if no payment info exists at all
        return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    
    // For prepaid orders, this is often the most reliable total in the old structure
    if (payments.prepaid && typeof payments.prepaid === 'number' && payments.prepaid > 0) {
        return payments.prepaid;
    }

    // Fallback to summing methods if `prepaid` isn't available
    if (payments.methods && Array.isArray(payments.methods) && payments.methods.length > 0) {
        return payments.methods.reduce((sum: number, method: any) => sum + (method.value || 0), 0);
    }
    
    // Final fallback
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  processedOrders = computed<ProcessedIfoodOrder[]>(() => {
    const now = this.currentTime();
    const allLogs = this.webhookLogs();

    return this.posState.openOrders()
      .filter(o => o.order_type === 'iFood-Delivery' || o.order_type === 'iFood-Takeout')
      .map(order => {
        let isScheduledAndHeld = false;
        let timeToPrepare = 0;
        let startTime = new Date(order.timestamp).getTime();

        if (order.ifood_order_timing === 'SCHEDULED' && order.ifood_scheduled_at) {
          const prepStartTime = new Date(order.ifood_scheduled_at).getTime();

          if (now < prepStartTime) {
            isScheduledAndHeld = true;
            timeToPrepare = Math.floor((prepStartTime - now) / 1000);
          } else {
            startTime = prepStartTime;
          }
        }
        
        const elapsedTime = isScheduledAndHeld ? 0 : Math.floor((now - startTime) / 1000);
        const isLate = elapsedTime > 600; // Late after 10 minutes

        let timerColor = 'text-green-300';
        if (elapsedTime > 300) timerColor = 'text-yellow-300'; // 5 mins
        if (isLate) timerColor = 'text-red-300';
        if (isScheduledAndHeld) {
          timerColor = 'text-cyan-300';
        }

        const requiresCode = allLogs.some(log => log.ifood_order_id === order.ifood_order_id && log.event_code === 'DELIVERY_DROP_CODE_REQUESTED');
        
        const paymentDetails = this.getPaymentDetails(order);
        const paymentData = order.ifood_payments as any;
        const totalInfo = paymentData?.total;

        const totalAmount = this.getOrderTotalAmount(order);
        const subTotal = totalInfo?.subTotal ?? order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = totalInfo?.deliveryFee ?? 0;
        const additionalFees = totalInfo?.additionalFees ?? 0;

        const disputeDetails = order.ifood_dispute_details as any;
        const disputeEvidences = disputeDetails?.metadata?.evidences?.map((e: any) => e.url).filter(Boolean) || [];


        return {
          ...order,
          elapsedTime,
          isLate,
          timerColor,
          ifoodStatus: this.getIfoodStatus(order),
          logisticsStatus: this.getLogisticsStatus(order, allLogs),
          requiresDeliveryCode: requiresCode,
          paymentDetails: paymentDetails.paymentDetails,
          changeDue: paymentDetails.changeDue,
          isScheduledAndHeld,
          timeToPrepare,
          totalAmount,
          subTotal,
          deliveryFee,
          additionalFees,
          disputeEvidences,
        };
      })
      .sort((a, b) => {
        if (a.isScheduledAndHeld && !b.isScheduledAndHeld) return 1;
        if (!a.isScheduledAndHeld && b.isScheduledAndHeld) return -1;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
  });

  receivedOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'RECEIVED'));
  inPreparationOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'IN_PREPARATION'));
  readyOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'DISPATCHED' || o.ifoodStatus === 'READY_FOR_PICKUP'));
  
  finishedOrders = computed<ProcessedIfoodOrder[]>(() => {
    const now = this.currentTime();
    return this.ifoodState.recentlyFinishedIfoodOrders()
      .map(order => {
        const completedTime = new Date(order.completed_at!).getTime();
        const elapsedTime = Math.floor((now - completedTime) / 1000); // Time since finished
        
        const paymentDetails = this.getPaymentDetails(order);
        const paymentData = order.ifood_payments as any;
        const totalInfo = paymentData?.total;
        
        const totalAmount = this.getOrderTotalAmount(order);
        const subTotal = totalInfo?.subTotal ?? order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = totalInfo?.deliveryFee ?? 0;
        const additionalFees = totalInfo?.additionalFees ?? 0;

        return {
          ...order,
          elapsedTime,
          isLate: false, // Not applicable
          timerColor: order.status === 'CANCELLED' ? 'text-red-400' : 'text-gray-400',
          ifoodStatus: order.status as IfoodOrderStatus,
          logisticsStatus: null, // Not relevant
          requiresDeliveryCode: false,
          paymentDetails: paymentDetails.paymentDetails,
          changeDue: paymentDetails.changeDue,
          totalAmount,
          subTotal,
          deliveryFee,
          additionalFees,
        };
      })
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
  });


  async confirmOrderAndPrepare(order: ProcessedIfoodOrder) {
    if (!order.ifood_order_id) return;
    
    this.updatingOrders.update(set => new Set(set).add(order.id));
    this.soundNotificationService.playConfirmationSound();

    try {
        // First, confirm with iFood API
        const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, 'CONFIRMED');
        if (!apiSuccess) throw apiError;
        
        // Then, update our internal status
        const itemIdsToUpdate = (order.order_items || []).filter(i => i.status === 'PENDENTE').map(i => i.id);
        if (itemIdsToUpdate.length > 0) {
            const { success: dbSuccess, error: dbError } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'EM_PREPARO');
            if (!dbSuccess) throw dbError;
        }

    } catch (error: any) {
        this.notificationService.show(`Erro ao confirmar pedido: ${error.message}`, 'error');
    } finally {
        this.updatingOrders.update(set => {
            const newSet = new Set(set);
            newSet.delete(order.id);
            return newSet;
        });
    }
  }

  async markOrderAsReadyForDispatch(order: ProcessedIfoodOrder) {
      if (!order.ifood_order_id) return;
      
      this.updatingOrders.update(set => new Set(set).add(order.id));
      this.soundNotificationService.playConfirmationSound();
      
      let targetStatus: IfoodOrderStatus = 'DISPATCHED'; // Default for merchant delivery
      if (order.order_type === 'iFood-Takeout') {
        // FIX: Use 'READY_FOR_PICKUP' instead of the incorrect 'READY_TO_PICKUP' to match the type definition.
        targetStatus = 'READY_FOR_PICKUP';
      } else if (order.delivery_info?.deliveredBy === 'IFOOD') {
        // FIX: Use 'READY_FOR_PICKUP' instead of the incorrect 'READY_TO_PICKUP' to match the type definition.
        targetStatus = 'READY_FOR_PICKUP';
      }


      try {
          const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, targetStatus);
          if (!apiSuccess) throw apiError;
          
          const itemIdsToUpdate = (order.order_items || []).filter(i => i.status === 'PENDENTE' || i.status === 'EM_PREPARO').map(i => i.id);
          if (itemIdsToUpdate.length > 0) {
              const { success: dbSuccess, error: dbError } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'PRONTO');
              if (!dbSuccess) throw dbError;
          }

      } catch (error: any) {
          this.notificationService.show(`Erro ao marcar como pronto: ${error.message}`, 'error');
      } finally {
          this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(order.id);
              return newSet;
          });
      }
  }

  async cancelOrder(order: ProcessedIfoodOrder) {
    if (!order.ifood_order_id) return;
  
    this.isLoadingCancellationReasons.set(true);
    this.updatingOrders.update(set => new Set(set).add(order.id));
  
    try {
      const reasons = await this.ifoodMenuService.getCancellationReasons(order.ifood_order_id);
      if (reasons.length === 0) {
        throw new Error('Não foi possível obter os motivos de cancelamento do iFood.');
      }
      this.cancellationReasons.set(reasons);
      this.orderToCancel.set(order);
      this.isCancelModalOpen.set(true);
    } catch (error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
      // On failure, remove the loading state from the order.
      this.updatingOrders.update(s => {
        const newSet = new Set(s);
        newSet.delete(order.id);
        return newSet;
      });
    } finally {
      this.isLoadingCancellationReasons.set(false);
      // If modal opens, loading state is handled by modal close/confirm actions.
    }
  }
  
  handleCancelModalClose() {
    this.isCancelModalOpen.set(false);
    const order = this.orderToCancel();
    if (order) {
      this.updatingOrders.update(s => {
        const newSet = new Set(s);
        newSet.delete(order.id);
        return newSet;
      });
    }
    this.orderToCancel.set(null);
  }

  async handleConfirmCancellation(details: { code: string; reason: string; }) {
    this.isCancelModalOpen.set(false);
    const order = this.orderToCancel();
    if (!order || !order.ifood_order_id) return;

    // Spinner is already active from cancelOrder method
    this.soundNotificationService.playConfirmationSound();

    try {
      const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, 'CANCELLED', details);
      if (!apiSuccess) throw apiError;
      
      // The webhook will handle the DB update, but we can optimistically update to provide faster feedback.
      const { success: dbSuccess, error: dbError } = await this.posDataService.cancelOrder(order.id);
      if (!dbSuccess) throw dbError;

      this.notificationService.show(`Solicitação de cancelamento para #${order.ifood_display_id} enviada.`, 'success');
      this.closeDetailModal();

    } catch (error: any) {
      this.notificationService.show(`Erro ao cancelar pedido: ${error.message}`, 'error');
    } finally {
      this.updatingOrders.update(set => {
        const newSet = new Set(set);
        newSet.delete(order.id);
        return newSet;
      });
      this.orderToCancel.set(null);
    }
  }

  async deleteOrder(order: ProcessedIfoodOrder) {
      const confirmed = await this.notificationService.confirm(`Tem certeza que deseja DELETAR PERMANENTEMENTE o pedido #${order.ifood_display_id}? Esta ação não pode ser desfeita.`, 'Deletar Pedido?');
      if (!confirmed) return;

      this.updatingOrders.update(set => new Set(set).add(order.id));

      try {
          const { success, error } = await this.posDataService.deleteOrderAndItems(order.id);
          if (!success) throw error;
          
          this.notificationService.show(`Pedido #${order.ifood_display_id} deletado com sucesso.`, 'success');
          this.closeDetailModal();

      } catch (error: any) {
          this.notificationService.show(`Erro ao deletar pedido: ${error.message}`, 'error');
      } finally {
          this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(order.id);
              return newSet;
          });
      }
  }
  
  // --- LOGISTICS METHODS ---
  openAssignDriverModal(order: ProcessedIfoodOrder) {
    this.orderForDriverModal.set(order);
    this.isAssignDriverModalOpen.set(true);
  }
  closeAssignDriverModal() { this.isAssignDriverModalOpen.set(false); }

  async assignDriver(form: { name: string; phone: string; vehicle: string; }) {
    const order = this.orderForDriverModal();
    if (!order || !order.ifood_order_id || !form.name || !form.phone) {
      this.notificationService.show('Nome e telefone do entregador são obrigatórios.', 'warning');
      return;
    }
    await this.handleLogisticsAction(order.id, order.ifood_order_id, 'assignDriver', {
      workerName: form.name,
      workerPhone: form.phone,
      workerVehicleType: form.vehicle
    });
    this.closeAssignDriverModal();
  }

  async updateLogisticsStatus(order: ProcessedIfoodOrder, action: 'goingToOrigin' | 'arrivedAtOrigin' | 'dispatch' | 'arrivedAtDestination') {
    if (!order.ifood_order_id) return;
    await this.handleLogisticsAction(order.id, order.ifood_order_id, action);
  }

  private async handleLogisticsAction(orderId: string, ifoodOrderId: string, action: string, details?: any) {
    this.updatingOrders.update(set => new Set(set).add(orderId));
    try {
      const { success, error } = await this.ifoodDataService.sendLogisticsAction(ifoodOrderId, action, details);
      if (!success) throw error;
      // Manually refetch logs to update the UI state
      await this.supabaseStateService.refetchIfoodLogs(); 
    } catch (error: any) {
      this.notificationService.show(`Erro na ação de logística: ${error.message}`, 'error');
    } finally {
       this.updatingOrders.update(set => {
            const newSet = new Set(set);
            newSet.delete(orderId);
            return newSet;
        });
    }
  }
  
  // --- Dispute Methods ---
  async handleAcceptDispute(order: ProcessedIfoodOrder) {
    if (!order.ifood_dispute_id) return;
    this.updatingOrders.update(set => new Set(set).add(order.id));
    try {
      const { success, error } = await this.ifoodDataService.sendDisputeAction(order.ifood_dispute_id, 'acceptDispute');
      if (!success) throw error;
      this.notificationService.show('Disputa aceita com sucesso.', 'success');
      // Here you might want to optimistically update the order state or refetch it.
    } catch (error: any) {
      this.notificationService.show(`Erro ao aceitar disputa: ${error.message}`, 'error');
    } finally {
      this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
    }
  }

  openRejectDisputeModal(order: ProcessedIfoodOrder) {
    this.orderToReject.set(order);
    this.isRejectDisputeModalOpen.set(true);
  }

  async handleConfirmRejection(reason: string) {
    this.isRejectDisputeModalOpen.set(false);
    const order = this.orderToReject();
    if (!order || !order.ifood_dispute_id) return;
    this.updatingOrders.update(set => new Set(set).add(order.id));
    try {
      const { success, error } = await this.ifoodDataService.sendDisputeAction(order.ifood_dispute_id, 'rejectDispute', { reason });
      if (!success) throw error;
      this.notificationService.show('Disputa rejeitada com sucesso.', 'success');
    } catch (error: any) {
      this.notificationService.show(`Erro ao rejeitar disputa: ${error.message}`, 'error');
    } finally {
      this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
      this.orderToReject.set(null);
    }
  }

  openProposeRefundModal(order: ProcessedIfoodOrder) {
    this.orderToProposeRefund.set(order);
    this.refundAmount.set(0);
    this.isProposeRefundModalOpen.set(true);
  }

  async handleConfirmRefund(details: { amount: number }) {
    this.isProposeRefundModalOpen.set(false);
    const order = this.orderToProposeRefund();
    if (!order || !order.ifood_dispute_id || !order.ifood_dispute_details.alternatives?.[0]?.id) return;

    const alternativeId = order.ifood_dispute_details.alternatives[0].id;
    const amountInCents = Math.round(details.amount * 100);

    this.updatingOrders.update(set => new Set(set).add(order.id));
    try {
        const { success, error } = await this.ifoodDataService.proposeDisputeAlternative(
            order.ifood_dispute_id,
            alternativeId,
            {
                type: "REFUND",
                metadata: {
                    amount: {
                        value: String(amountInCents),
                        currency: "BRL"
                    }
                }
            }
        );
        if (!success) throw error;
        this.notificationService.show('Contraproposta de reembolso enviada.', 'success');
    } catch (error: any) {
        this.notificationService.show(`Erro ao enviar contraproposta: ${error.message}`);
    } finally {
        this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
        this.orderToProposeRefund.set(null);
    }
  }
  
  openNegotiateTimeModal(order: ProcessedIfoodOrder) {
    this.notificationService.alert('A funcionalidade de negociar atraso ainda não foi implementada.', 'Em Breve');
  }

  // --- Code Verification Methods ---
  openVerifyCodeModal(order: ProcessedIfoodOrder, type: 'pickup' | 'delivery') {
    this.orderForCodeModal.set(order);
    this.codeTypeForModal.set(type);
    this.isVerifyCodeModalOpen.set(true);
  }

  async handleConfirmVerification(code: string) {
    this.isVerifyCodeModalOpen.set(false);
    const order = this.orderForCodeModal();
    const type = this.codeTypeForModal();
    if (!order || !order.ifood_order_id || !code || !type) return;

    const action = type === 'pickup' ? 'validatePickupCode' : 'verifyDeliveryCode';
    this.updatingOrders.update(set => new Set(set).add(order.id));

    try {
      const { success: serviceSuccess, error, data } = await this.ifoodDataService.sendLogisticsAction(order.ifood_order_id, action, { code });
      
      if (!serviceSuccess) {
          // This catches network errors and 4xx/5xx responses that the service translates into an error.
          // iFood's 404 for invalid delivery code will be caught here.
          throw error;
      }
      
      let isCodeValid = false;
      if (action === 'validatePickupCode') {
          // Pickup code returns a body with a success flag
          isCodeValid = data?.success === true;
      } else if (action === 'verifyDeliveryCode') {
          // Delivery code returns 202 Accepted (no body) on success.
          // The service call succeeding is enough to confirm validity.
          isCodeValid = true;
      }

      if (isCodeValid) {
        this.notificationService.show('Código validado com sucesso!', 'success');
      } else {
        // This will now only catch the `success: false` from the pickup code response
        this.notificationService.show('Código de verificação inválido.', 'error');
      }
    } catch (error: any) {
      this.notificationService.show(`Erro ao verificar código: ${error.message}`, 'error');
    } finally {
      this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
      this.orderForCodeModal.set(null);
      this.codeTypeForModal.set(null);
    }
  }
  
  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';

    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  
  openLogDetailModal(log: IfoodWebhookLog) {
    this.selectedLogForDetail.set(log);
  }
  
  closeLogDetailModal() {
    this.selectedLogForDetail.set(null);
  }

  openDetailModal(order: ProcessedIfoodOrder) {
    this.selectedOrderForDetail.set(order);
    this.isDetailModalOpen.set(true);
  }

  closeDetailModal() {
    this.isDetailModalOpen.set(false);
    this.selectedOrderForDetail.set(null);
  }

  getLogStatusClass(status: string | null): string {
    if (!status) return 'bg-gray-600';
    if (status.startsWith('SUCCESS')) return 'bg-green-600';
    if (status.startsWith('ERROR')) return 'bg-red-600';
    return 'bg-blue-600';
  }

  // Helper for template
  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getOrderBenefitsTotal(order: ProcessedIfoodOrder): number {
    if (!order.ifood_benefits || !Array.isArray(order.ifood_benefits)) {
      return 0;
    }
    // The payload `ifood_benefits` is an array of objects like { value: number }
    return order.ifood_benefits.reduce((acc: number, benefit: any) => acc + (benefit.value || 0), 0);
  }

  async openTrackingModal(order: ProcessedIfoodOrder) {
    if (!order.ifood_order_id) {
      this.notificationService.show('Este pedido não tem um ID iFood para rastreio.', 'warning');
      return;
    }
    this.isLoadingTracking.set(true);
    this.orderForTracking.set(order);
    this.isTrackingModalOpen.set(true);
    this.closeDetailModal(); // Close detail modal if open

    try {
      const data = await this.ifoodMenuService.trackOrder(order.ifood_order_id);
      this.trackingData.set(data);
    } catch (error: any) {
      this.notificationService.show(`Erro ao buscar rastreio: ${error.message}`, 'error');
      this.isTrackingModalOpen.set(false); // Close modal on error
    } finally {
      this.isLoadingTracking.set(false);
    }
  }

  closeTrackingModal() {
    this.isTrackingModalOpen.set(false);
    this.trackingData.set(null);
    this.orderForTracking.set(null);
  }
  
  formatLogisticsStatus(status: LogisticsStatus | null): string {
    if (!status) return '';
    return status.replace(/_/g, ' ').toLowerCase();
  }
}
