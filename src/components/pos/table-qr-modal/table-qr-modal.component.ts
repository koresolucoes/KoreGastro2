import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order, Table, TableStatus } from '../../../models/db.models';
import { QRCodeComponent } from 'angularx-qrcode';
import { PublicDataService } from '../../../services/public-data.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-table-qr-modal',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  templateUrl: './table-qr-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableQrModalComponent {
  publicDataService = inject(PublicDataService);
  notificationService = inject(NotificationService);

  table = input.required<Table | null>();
  order = input.required<Order | null>();
  closeModal = output<void>();

  // Determine the table URL
  tableUrl = computed(() => {
    const o = this.order();
    const t = this.table();
    if (!o || !t) return '';
    
    // In actual prod, replace window.location.origin with the proper deploy URL if needed
    // But since it's a PWA, it should be the same origin.
    // E.g., https://meurestaurante.com/menu/:userId/t/:session_token
    const base = window.location.origin;
    return `${base}/#/menu/${o.user_id}/t/${o.session_token || o.id}`;
  });

  async copyLink() {
    let successful = false;
    let usedFallback = false;

    // Try modern API if available and securely context
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(this.tableUrl());
        successful = true;
      } catch (e) {
        console.error('Clipboard API falhou, tentando fallback', e);
        usedFallback = true;
      }
    } else {
      usedFallback = true;
    }
    
    if (usedFallback) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = this.tableUrl();
        // Avoid scrolling to bottom
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        // execCommand must be synchronous from a user event to work reliably
        successful = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('Fallback execCommand falhou', err);
      }
    }

    if (successful) {
      this.notificationService.show('Link copiado para a área de transferência', 'success');
    } else {
      // One last try for simple environments - prompt the user to copy manually
      prompt('Copie o link abaixo:', this.tableUrl());
    }
  }

  printQr() {
    // Basic print trigger, might need a more sophisticated printable layout later
    window.print();
  }
}
