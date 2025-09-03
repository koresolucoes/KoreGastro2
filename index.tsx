
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideZonelessChangeDetection, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';

// The Supabase client will be initialized automatically when its module is imported by other services.
// No explicit initialization is needed here anymore.

// Register the locale data for pt-BR
registerLocaleData(localePt);

/**
 * Main function to bootstrap the Angular application.
 */
function bootstrap() {
  try {
    // With a static config, we can bootstrap the application synchronously.
    bootstrapApplication(AppComponent, {
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(APP_ROUTES, withHashLocation()),
        // Set the default locale for the application
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    });
  } catch (err) {
    console.error('Failed to bootstrap the application:', err);
    // Errors related to configuration will now be displayed on the screen
    // by the client initializer, providing clearer feedback.
  }
}

// Start the application bootstrap process.
bootstrap();

// AI Studio always uses an `index.tsx` file for all project types.
