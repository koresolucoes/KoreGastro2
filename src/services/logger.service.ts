import { Injectable } from '@angular/core';

export type ClientLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface ClientLogPayload {
  level: ClientLogLevel;
  message: string;
  context?: Record<string, any>;
  timestamp: string;
  traceId: string;
}

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private logsHistory: ClientLogPayload[] = [];
  private readonly maxHistory = 100;
  private readonly sessionTraceId: string;

  constructor() {
    this.sessionTraceId = 'cli_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
  }

  getTraceId(): string {
    return this.sessionTraceId;
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('WARN', message, context);
  }

  error(message: string, error?: any, context?: Record<string, any>): void {
    const errorContext = {
      ...context,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true
    };
    this.log('ERROR', message, errorContext);
    this.dispatchTelemetry('ERROR', message, errorContext);
    this.reportToSentry(error || message, errorContext);
  }

  fatal(message: string, error?: any, context?: Record<string, any>): void {
    const errorContext = {
      ...context,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true
    };
    this.log('FATAL', message, errorContext);
    this.dispatchTelemetry('FATAL', message, errorContext);
    this.reportToSentry(error || message, errorContext);
  }

  getLogs(): ClientLogPayload[] {
    return [...this.logsHistory];
  }

  clearLogs(): void {
    this.logsHistory = [];
  }

  getDiagnosticsReport(): Record<string, any> {
    return {
      sessionTraceId: this.sessionTraceId,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server',
      screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A',
      onlineStatus: typeof navigator !== 'undefined' ? navigator.onLine : true,
      totalLogsRecorded: this.logsHistory.length,
      errorCount: this.logsHistory.filter(l => l.level === 'ERROR' || l.level === 'FATAL').length,
      recentLogs: this.logsHistory.slice(-10)
    };
  }

  private log(level: ClientLogLevel, message: string, context?: Record<string, any>): void {
    const payload: ClientLogPayload = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
      traceId: this.sessionTraceId
    };

    // Keep memory history capped
    this.logsHistory.push(payload);
    if (this.logsHistory.length > this.maxHistory) {
      this.logsHistory.shift();
    }

    const formattedLog = `[ChefOS ${level}] [${payload.timestamp}] [${payload.traceId}] ${message}`;
    
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(formattedLog, context || '');
    } else if (level === 'WARN') {
      console.warn(formattedLog, context || '');
    } else {
      console.log(formattedLog, context || '');
    }
  }

  private dispatchTelemetry(level: ClientLogLevel, message: string, context?: Record<string, any>): void {
    if (typeof fetch === 'undefined') return;

    fetch('/api/v2/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': this.sessionTraceId
      },
      body: JSON.stringify({
        level,
        message,
        context,
        traceId: this.sessionTraceId
      })
    }).catch(() => {
      // Ignore network errors when dispatching telemetry
    });
  }

  private reportToSentry(errOrMsg: any, context?: Record<string, any>): void {
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      try {
        const sentry = (window as any).Sentry;
        if (typeof errOrMsg === 'string') {
          sentry.captureMessage(errOrMsg, { extra: context });
        } else {
          sentry.captureException(errOrMsg, { extra: context });
        }
      } catch {
        // Ignore Sentry SDK bridge exceptions
      }
    }
  }
}

