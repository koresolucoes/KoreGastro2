
import { ErrorHandler, Injectable } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    const chunkFailedMessage = /Loading chunk [\d]+ failed/;
    const dynamicImportFailedMessage = /Failed to fetch dynamically imported module/;
    const message = error ? error.message ? error.message : error.toString() : '';

    if (chunkFailedMessage.test(message) || dynamicImportFailedMessage.test(message)) {
      console.error('Erro de carregamento de módulo detectado. Tentando recarregar...', error);
      
      // Verifica se já tentamos recarregar recentemente (evita loop infinito)
      const lastReload = sessionStorage.getItem('last_chunk_error_reload');
      const now = Date.now();
      
      if (!lastReload || now - parseInt(lastReload) > 10000) {
          sessionStorage.setItem('last_chunk_error_reload', now.toString());
          window.location.reload();
      }
    } else {
        // Loga outros erros normalmente
        console.error('Global Error:', error);
    }
  }
}
