/**
 * ChefOS Structured Logger Utility for Serverless & Edge API Routes
 * Formats logs into JSON with timestamp, log level, correlation IDs, and context payload.
 * Compatible with Datadog, Sentry, Supabase Logflare, and Google Cloud Logging.
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogContext {
  restaurantId?: string;
  userId?: string;
  traceId?: string;
  endpoint?: string;
  method?: string;
  latencyMs?: number;
  statusCode?: number;
  [key: string]: any;
}

export class Logger {
  private static generateTraceId(): string {
    return 'trace_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  }

  private static formatLog(level: LogLevel, message: string, context?: LogContext, error?: any) {
    const traceId = context?.traceId || this.generateTraceId();
    const logEntry = {
      timestamp: new Date().toISOString(),
      app: 'ChefOS-API',
      version: '2.1.0',
      level,
      message,
      traceId,
      ...(context || {}),
      ...(error ? {
        error: {
          name: error.name || 'Error',
          message: error.message || String(error),
          stack: process.env.NODE_ENV === 'development' || level === 'FATAL' ? error.stack : undefined
        }
      } : {})
    };

    return JSON.stringify(logEntry);
  }

  static info(message: string, context?: LogContext) {
    console.log(this.formatLog('INFO', message, context));
  }

  static warn(message: string, context?: LogContext) {
    console.warn(this.formatLog('WARN', message, context));
  }

  static error(message: string, error?: any, context?: LogContext) {
    const logStr = this.formatLog('ERROR', message, context, error);
    console.error(logStr);
    this.dispatchCriticalAlert('ERROR', message, context, error);
  }

  static fatal(message: string, error?: any, context?: LogContext) {
    const logStr = this.formatLog('FATAL', message, context, error);
    console.error(logStr);
    this.dispatchCriticalAlert('FATAL', message, context, error);
  }

  /**
   * Asynchronously dispatches critical alert payloads to configured monitoring webhooks (Slack, PagerDuty, Discord).
   * Non-blocking to keep serverless execution fast.
   */
  private static async dispatchCriticalAlert(level: LogLevel, message: string, context?: LogContext, error?: any) {
    const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL || process.env.MONITORING_ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const payload = {
        text: `🚨 *[ChefOS ${level}]* ${message}`,
        attachments: [
          {
            color: level === 'FATAL' ? '#FF0000' : '#FF9900',
            fields: [
              { title: 'Endpoint', value: `${context?.method || ''} ${context?.endpoint || 'N/A'}`, short: true },
              { title: 'Restaurant ID', value: context?.restaurantId || 'N/A', short: true },
              { title: 'Trace ID', value: context?.traceId || 'N/A', short: true },
              { title: 'Error', value: error?.message || 'None', short: false }
            ],
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch {
      // Ignore webhook notification errors to prevent secondary crashes
    }
  }
}

