
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideZonelessChangeDetection, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';
import { loadEnvironmentConfig } from './src/config/environment';

// Register the locale data for pt-BR
registerLocaleData(localePt);

/**
 * Asynchronous main function to ensure configuration is loaded
 * before the Angular application is bootstrapped.
 */
async function bootstrap() {
  try {
    // Fetch and set the runtime configuration from the serverless function.
    // This must complete before any service that depends on the config is created.
    await loadEnvironmentConfig();

    // Now that the config is loaded, bootstrap the Angular application.
    await bootstrapApplication(AppComponent, {
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(APP_ROUTES, withHashLocation()),
        // Set the default locale for the application
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    });
  } catch (err) {
    console.error('Failed to bootstrap the application:', err);
    // The error is already displayed on the screen by the config loader.
  }
}

// Start the application bootstrap process.
bootstrap();
