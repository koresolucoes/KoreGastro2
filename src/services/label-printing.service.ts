import { Injectable, inject, LOCALE_ID } from '@angular/core';
import { LabelType } from '../models/db.models';
import { DatePipe } from '@angular/common';

export interface LabelData {
  itemName: string;
  manipulationDate: Date;
  expirationDate: Date;
  responsibleName: string;
  quantity?: number;
  unit?: string;
  lotNumber?: string;
  storageConditions?: string;
  type: LabelType;
}

@Injectable({
  providedIn: 'root'
})
export class LabelPrintingService {
  private locale = inject(LOCALE_ID);
  private datePipe = new DatePipe(this.locale);

  // PVPS Color Standard (Segunda -> Domingo)
  private readonly DAY_COLORS: Record<number, string> = {
    1: '#2563eb', // Monday: Blue
    2: '#eab308', // Tuesday: Yellow
    3: '#16a34a', // Wednesday: Green
    4: '#dc2626', // Thursday: Red
    5: '#ea580c', // Friday: Orange/Brown
    6: '#ffffff', // Saturday: White (needs border)
    0: '#9333ea', // Sunday: Purple (or Black, simplified to Purple for visibility)
  };
  
  private readonly DAY_NAMES: Record<number, string> = {
      1: 'SEGUNDA', 2: 'TERÇA', 3: 'QUARTA', 4: 'QUINTA', 5: 'SEXTA', 6: 'SÁBADO', 0: 'DOMINGO'
  };

  calculateExpiration(startDate: Date, days: number): Date {
    const exp = new Date(startDate);
    exp.setDate(exp.getDate() + days);
    // Set to end of day? Usually yes for "consumir até"
    exp.setHours(23, 59, 59, 999);
    return exp;
  }

  getDayColor(date: Date): string {
    return this.DAY_COLORS[date.getDay()];
  }
  
  getDayName(date: Date): string {
      return this.DAY_NAMES[date.getDay()];
  }

  printLabel(data: LabelData, format: 'standard' | 'compact' = 'standard') {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) {
      alert('Por favor, habilite pop-ups para imprimir.');
      return;
    }

    const html = this.generateHtml(data, format);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Small timeout to ensure styles loaded
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  private generateHtml(data: LabelData, format: 'standard' | 'compact'): string {
    const color = this.getDayColor(data.expirationDate);
    const dayName = this.getDayName(data.expirationDate);
    const isWhite = color === '#ffffff';
    const textColor = isWhite ? '#000000' : '#ffffff';
    const borderColor = isWhite ? '#000000' : color;
    
    const manipStr = this.datePipe.transform(data.manipulationDate, 'dd/MM/yy HH:mm');
    const expStr = this.datePipe.transform(data.expirationDate, 'dd/MM/yy HH:mm');
    const expDayOnly = this.datePipe.transform(data.expirationDate, 'dd/MM');

    // CSS optimized for thermal printers (usually 203dpi or 300dpi)
    // 60mm width is approx 226px at 96dpi screen, but printers vary. 
    // We use mm units for print media.
    const css = `
      @media print {
        @page { margin: 0; size: auto; }
        body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      body {
        width: ${format === 'standard' ? '60mm' : '40mm'};
        height: ${format === 'standard' ? '40mm' : '25mm'};
        overflow: hidden;
        border: 1px solid #000;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
      }
      .header {
        background-color: ${color};
        color: ${textColor};
        font-weight: bold;
        text-transform: uppercase;
        padding: 2px 4px;
        text-align: center;
        font-size: ${format === 'standard' ? '12px' : '10px'};
        border-bottom: 2px solid ${borderColor};
        display: flex;
        justify-content: space-between;
      }
      .body {
        flex: 1;
        padding: 2px 4px;
        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
        font-size: ${format === 'standard' ? '10px' : '9px'};
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .label { font-weight: bold; font-size: 0.8em; color: #444; }
      .value { font-weight: bold; }
      .big { font-size: ${format === 'standard' ? '14px' : '12px'}; }
      .footer {
        font-size: ${format === 'standard' ? '8px' : '7px'};
        text-align: center;
        border-top: 1px solid #ccc;
        padding-top: 1px;
        white-space: nowrap;
        overflow: hidden;
      }
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head><style>${css}</style></head>
      <body>
        <div class="header">
          <span>${dayName}</span>
          <span>${expDayOnly}</span>
        </div>
        <div class="body">
          <div style="text-align: center; font-weight: bold; margin-bottom: 2px; font-size: ${format === 'standard' ? '11px' : '10px'}; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
            ${data.itemName}
          </div>
          <div class="row">
            <span class="label">MANIP:</span>
            <span>${manipStr}</span>
          </div>
          <div class="row">
            <span class="label">VAL:</span>
            <span class="value big">${expStr}</span>
          </div>
          <div class="row">
            <span>${data.quantity ? `${data.quantity}${data.unit}` : ''}</span>
            <span>Resp: ${data.responsibleName.split(' ')[0]}</span>
          </div>
        </div>
        <div class="footer">
          ${data.lotNumber ? `Lote: ${data.lotNumber} | ` : ''}${data.storageConditions || ''}
        </div>
      </body>
      </html>
    `;
  }
}