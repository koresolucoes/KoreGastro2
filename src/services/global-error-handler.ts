
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LoggerService } from './logger.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private logger = inject(LoggerService);

  handleError(error: any): void {
    const chunkFailedMessage = /Loading chunk [\d]+ failed/;
    const dynamicImportFailedMessage = /Failed to fetch dynamically imported module/;
    const message = error ? (error.message ? error.message : error.toString()) : '';

    if (chunkFailedMessage.test(message) || dynamicImportFailedMessage.test(message)) {
      this.logger.warn('Erro de carregamento de módulo detectado. Tentando recarregar...', { error: message });
      
      // Verifica se já tentamos recarregar recentemente (evita loop infinito)
      const lastReload = sessionStorage.getItem('last_chunk_error_reload');
      const now = Date.now();
      
      if (!lastReload || now - parseInt(lastReload) > 10000) {
          sessionStorage.setItem('last_chunk_error_reload', now.toString());
          window.location.reload();
      }
    } else {
        // Loga outros erros no serviço central de observabilidade
        this.logger.error('Uncaught Global Error', error, {
          source: 'GlobalErrorHandler'
        });
    }
  }
}

