export type BootstrapStatus =
  | 'IDLE'
  | 'LOADING_CORE'
  | 'LOADING_ESSENTIAL'
  | 'READY'
  | 'ERROR';

export type BootstrapStage = 'CORE' | 'ESSENTIAL';

export interface BootstrapError {
  stage: BootstrapStage;
  message: string;
}

/**
 * Sanitizes bootstrap error messages to prevent exposing sensitive details
 * like credentials, tokens, or raw SQL queries.
 */
export function sanitizeBootstrapErrorMessage(rawError: any): string {
  if (!rawError) return 'Falha desconhecida no carregamento dos dados.';

  let msg = typeof rawError === 'string'
    ? rawError
    : rawError.message || rawError.error_description || (typeof rawError === 'object' ? JSON.stringify(rawError) : String(rawError));

  if (typeof msg !== 'string') {
    msg = 'Erro no carregamento dos dados.';
  }

  // Remove potential sensitive fields / secrets / tokens if present
  msg = msg.replace(/(token|bearer|key|secret|password|authorization)=([^\s&]+)/gi, '$1=***');

  // Truncate overly long error messages
  if (msg.length > 250) {
    msg = msg.substring(0, 250) + '...';
  }

  return msg || 'Erro ao carregar os dados do sistema.';
}
