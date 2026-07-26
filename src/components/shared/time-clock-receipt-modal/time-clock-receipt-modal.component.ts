import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeClockReceiptService } from '../../../services/time-clock-receipt.service';

@Component({
  selector: 'app-time-clock-receipt-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './time-clock-receipt-modal.component.html',
})
export class TimeClockReceiptModalComponent {
  private receiptService = inject(TimeClockReceiptService);
  
  receipt = this.receiptService.currentReceipt;

  close() {
    this.receiptService.closeReceipt();
  }

  printReceipt() {
    const printContents = document.getElementById('receipt-print-area')?.innerHTML;
    if (printContents) {
        const originalContents = document.body.innerHTML;
        document.body.innerHTML = `
            <div style="max-width: 300px; margin: 0 auto; font-family: monospace; color: black; background: white; padding: 20px;">
                ${printContents}
            </div>
        `;
        window.print();
        document.body.innerHTML = originalContents;
        window.location.reload(); // Reload to restore Angular app state after aggressive DOM swap
    }
  }
}
