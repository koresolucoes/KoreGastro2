import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeClockReceiptService } from '../../../services/time-clock-receipt.service';
import { SettingsStateService } from '../../../services/settings-state.service';

@Component({
  selector: 'app-time-clock-receipt-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './time-clock-receipt-modal.component.html',
})
export class TimeClockReceiptModalComponent {
  private receiptService = inject(TimeClockReceiptService);
  private settingsState = inject(SettingsStateService);
  
  receipt = this.receiptService.currentReceipt;
  companyProfile = this.settingsState.companyProfile;

  close() {
    this.receiptService.closeReceipt();
  }

  printReceipt() {
    const printContents = document.getElementById('receipt-print-area')?.innerHTML;
    if (printContents) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        iframe.contentDocument?.write(`
            <html>
            <head>
                <title>Comprovante de Ponto</title>
                <style>
                    body { font-family: monospace; color: black; background: white; padding: 20px; font-size: 12px; }
                    .text-center { text-align: center; }
                    .mb-4 { margin-bottom: 1rem; }
                    .mb-2 { margin-bottom: 0.5rem; }
                    .pb-2 { padding-bottom: 0.5rem; }
                    .font-bold { font-weight: bold; }
                    .font-black { font-weight: 900; }
                    .uppercase { text-transform: uppercase; }
                    .tracking-widest { letter-spacing: 0.1em; }
                    .border-b-2 { border-bottom: 2px solid rgba(0,0,0,0.1); }
                    .border-t-2 { border-top: 2px solid rgba(0,0,0,0.2); }
                    .border-dashed { border-style: dashed; }
                    .text-lg { font-size: 1.125rem; }
                    .text-\\[10px\\] { font-size: 10px; }
                    .space-y-3 > * + * { margin-top: 0.75rem; }
                    .block { display: block; }
                    .grid { display: grid; }
                    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    .gap-2 { gap: 0.5rem; }
                    .break-all { word-break: break-all; }
                    .mt-6 { margin-top: 1.5rem; }
                    .pt-4 { padding-top: 1rem; }
                </style>
            </head>
            <body>
                <div style="max-width: 300px; margin: 0 auto;">
                    ${printContents}
                </div>
            </body>
            </html>
        `);
        iframe.contentDocument?.close();
        
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 250);
    }
  }
}
