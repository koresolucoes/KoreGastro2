import { Component, ChangeDetectionStrategy, input, output, computed, InputSignal, OutputEmitterRef, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProcessedIfoodOrder } from '../../../models/app.models';
import { PrintingService } from '../../../services/printing.service';
import { IfoodDataService } from '../../../services/ifood-data.service';

@Component({
  selector: 'app-order-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailsModalComponent {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  closeModal: OutputEmitterRef<void> = output<void>();
  private printingService = inject(PrintingService);
  private ifoodDataService = inject(IfoodDataService);

  evidenceImages = signal<{src: string, loading: boolean, error: boolean}[]>([]);

  constructor() {
    effect(() => {
        const o = this.order();
        if (o?.disputeEvidences && o.disputeEvidences.length > 0) {
            this.loadEvidenceImages(o.disputeEvidences);
        } else {
            this.evidenceImages.set([]);
        }
    });
  }

  private async loadEvidenceImages(urls: string[]) {
    this.evidenceImages.set(urls.map(url => ({ src: url, loading: true, error: false })));

    for (const [index, url] of urls.entries()) {
        try {
            console.log(`[OrderDetails] Fetching evidence image: ${url}`);
            const result = await this.ifoodDataService.getEvidenceImage(url);
            this.evidenceImages.update(images => {
                const newImages = [...images];
                newImages[index] = { 
                    src: `data:${result.contentType};base64,${result.base64Image}`, 
                    loading: false, 
                    error: false 
                };
                return newImages;
            });
             console.log(`[OrderDetails] Successfully loaded evidence image.`);
        } catch (e) {
            console.error(`[OrderDetails] Failed to load evidence image from ${url}`, e);
            this.evidenceImages.update(images => {
                const newImages = [...images];
                if (newImages[index]) {
                    newImages[index].loading = false;
                    newImages[index].error = true;
                }
                return newImages;
            });
        }
    }
  }

  subTotal = computed(() => {
    const currentOrder = this.order();
    if (!currentOrder) return 0;
    return currentOrder.subTotal ?? 0;
  });

  deliveryFee = computed(() => {
    const o = this.order();
    return o?.deliveryFee ?? 0;
  });
  
  additionalFees = computed(() => {
    const o = this.order();
    return o?.additionalFees ?? 0;
  });

  orderBenefitsTotal = computed(() => {
    const currentOrder = this.order();
    if (!currentOrder?.ifood_benefits || !Array.isArray(currentOrder.ifood_benefits)) {
      return 0;
    }
    // The payload `ifood_benefits` is an array of objects like { value: number }
    return currentOrder.ifood_benefits.reduce((acc: number, benefit: any) => acc + (benefit.value || 0), 0);
  });
  
  finalTotal = computed(() => {
    const currentOrder = this.order();
    if (!currentOrder) return 0;
    return currentOrder.totalAmount ?? 0;
  });


  orderBenefits = computed(() => {
    const o = this.order();
    if (!o?.ifood_benefits || !Array.isArray(o.ifood_benefits)) {
      return [];
    }
    
    return o.ifood_benefits.flatMap((benefit: any) => 
      (benefit?.sponsorshipValues || []).map((sponsor: any) => ({
        sponsor: sponsor.name === 'MERCHANT' ? 'Loja' : (sponsor.name || 'Desconhecido'),
        value: sponsor.value || 0
      }))
    ).filter((b: any) => b.value > 0);
  });

  getDisputeMessage(order: ProcessedIfoodOrder | null): string | null {
    if (!order || !order.ifood_dispute_details) {
      return null;
    }
    
    let details = order.ifood_dispute_details as any;
    
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch (e) {
        console.error('Could not parse ifood_dispute_details string:', e);
        return null;
      }
    }
    
    if (details && typeof details === 'object') {
        // For full cancellation disputes
        if ('message' in details && details.message) {
          return details.message as string;
        }

        // For partial cancellation disputes from HANDSHAKE_DISPUTE (reason is nested)
        if (details.metadata && Array.isArray(details.metadata.items) && details.metadata.items.length > 0) {
            return details.metadata.items.map((item: any) => item.reason).filter(Boolean).join('; ');
        }
    }
    
    return null;
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  printIfoodOrder() {
    const orderToPrint = this.order();
    if (orderToPrint) {
      this.printingService.printIfoodReceipt(orderToPrint);
    }
  }
}