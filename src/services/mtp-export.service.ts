import { Injectable, inject } from '@angular/core';
import { TimeClockEntry } from '../models/db.models';
import { SettingsStateService } from './settings-state.service';
import { HrStateService } from './hr-state.service';

@Injectable({
  providedIn: 'root'
})
export class MtpExportService {
  private settingsState = inject(SettingsStateService);
  private hrState = inject(HrStateService);

  private downloadFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Gera Arquivo Fonte de Dados (AFD)
  exportAFD(entries: TimeClockEntry[]) {
    const profile = this.settingsState.companyProfile();
    const cnpj = (profile?.cnpj || '00000000000000').replace(/\D/g, '').padEnd(14, '0');
    
    let content = `00000000011${cnpj}REP-A/P CHEFOS           \r\n`; // Header
    
    let nsr = 2;
    // Sort entries chronologically to generate sequential events
    const events: { nsr: number, type: string, time: Date, cpf: string }[] = [];
    
    entries.forEach(entry => {
      const emp = this.hrState.employees().find(e => e.id === entry.employee_id);
      const cpf = (emp?.cpf || '00000000000').replace(/\D/g, '').padEnd(11, '0');
      
      if (entry.clock_in_time) {
        events.push({ nsr: nsr++, type: '3', time: new Date(entry.clock_in_time), cpf });
      }
      if (entry.break_start_time) {
        events.push({ nsr: nsr++, type: '3', time: new Date(entry.break_start_time), cpf });
      }
      if (entry.break_end_time) {
        events.push({ nsr: nsr++, type: '3', time: new Date(entry.break_end_time), cpf });
      }
      if (entry.clock_out_time) {
        events.push({ nsr: nsr++, type: '3', time: new Date(entry.clock_out_time), cpf });
      }
    });

    events.sort((a, b) => a.time.getTime() - b.time.getTime());
    
    // Re-assign NSR sequentially after sort
    events.forEach((evt, idx) => {
      evt.nsr = idx + 2;
      const nsrStr = evt.nsr.toString().padStart(9, '0');
      const dd = String(evt.time.getDate()).padStart(2, '0');
      const mm = String(evt.time.getMonth() + 1).padStart(2, '0');
      const yyyy = evt.time.getFullYear();
      const dateStr = `${dd}${mm}${yyyy}`;
      const timeStr = evt.time.toTimeString().split(' ')[0].replace(/:/g, '').substring(0, 4) || '0000';
      content += `${nsrStr}3${dateStr}${timeStr}${evt.cpf}\r\n`; // Simplified record format
    });

    const trailerNsr = (events.length + 2).toString().padStart(9, '0');
    content += `${trailerNsr}999999999\r\n`; // Trailer

    this.downloadFile(content, `AFD_${cnpj}_${new Date().toISOString().split('T')[0]}.txt`);
  }

  // Gera Memória de Registro de Ponto (MRP)
  exportMRP(entries: TimeClockEntry[]) {
    // Similar to AFD but might include application specific logs. We will duplicate the concept for the demo.
    this.exportAFD(entries); 
  }

  // Gera Arquivo Eletrônico de Jornada (AEJ)
  exportAEJ(entries: TimeClockEntry[]) {
    const profile = this.settingsState.companyProfile();
    const cnpj = (profile?.cnpj || '00000000000000').replace(/\D/g, '').padEnd(14, '0');
    
    let content = `00000000011${cnpj}AEJ CHEFOS               \r\n`; // Header
    
    // Group by employee and day
    const summary = new Map<string, { cpf: string, name: string, totalMs: number }>();

    entries.forEach(entry => {
      const emp = this.hrState.employees().find(e => e.id === entry.employee_id);
      const cpf = (emp?.cpf || '00000000000').replace(/\D/g, '').padEnd(11, '0');
      const name = (emp?.name || 'DESCONHECIDO').substring(0, 50).padEnd(50, ' ');
      
      let durationMs = 0;
      if (entry.clock_in_time && entry.clock_out_time) {
        durationMs = new Date(entry.clock_out_time).getTime() - new Date(entry.clock_in_time).getTime();
        if (entry.break_start_time && entry.break_end_time) {
           durationMs -= (new Date(entry.break_end_time).getTime() - new Date(entry.break_start_time).getTime());
        }
      }

      if (!summary.has(cpf)) {
        summary.set(cpf, { cpf, name, totalMs: 0 });
      }
      summary.get(cpf)!.totalMs += Math.max(0, durationMs);
    });

    let nsr = 2;
    summary.forEach(empSum => {
      const nsrStr = nsr.toString().padStart(9, '0');
      const hours = Math.floor(empSum.totalMs / (1000 * 60 * 60));
      const hoursStr = hours.toString().padStart(4, '0');
      content += `${nsrStr}4${empSum.cpf}${empSum.name}${hoursStr}\r\n`;
      nsr++;
    });

    const trailerNsr = nsr.toString().padStart(9, '0');
    content += `${trailerNsr}999999999\r\n`;

    this.downloadFile(content, `AEJ_${cnpj}_${new Date().toISOString().split('T')[0]}.txt`);
  }
}
