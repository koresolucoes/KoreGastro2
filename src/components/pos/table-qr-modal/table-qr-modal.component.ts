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
    // E.g., https://meurestaurante.com/t/:session_token
    const base = window.location.origin;
    return `${base}/t/${o.session_token || o.id}`;
  });

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.tableUrl());
      await this.notificationService.success('Link copiado para a área de transferência');
    } catch (e) {
      console.error(e);
      await this.notificationService.alert('Não foi possível copiar o link.');
    }
  }

  printQr() {
    // Basic print trigger, might need a more sophisticated printable layout later
    window.print();
  }
}
