
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideZonelessChangeDetection, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';
import { supabase } from './src/services/supabase-client';

// Register the locale data for pt-BR
registerLocaleData(localePt);

/**
 * Handles the Supabase authentication flow when tokens are present in the URL hash.
 * This must run *before* the Angular application is bootstrapped to avoid race conditions
 * with the Angular router.
 */
async function handleUrlTokenAuthentication() {
  const hash = window.location.hash.substring(1);
  if (!hash || !hash.includes('access_token')) {
    return; // No token found, proceed to normal bootstrap
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  if (accessToken && refreshToken && type !== 'recovery') {
    console.log('Tokens found in URL. Attempting to set session before bootstrapping...');
    
    try {
      const { error } = await (supabase.auth as any).setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('Error setting session from URL tokens:', error);
      } else {
        console.log('Session successfully set from URL tokens.');
      }
    } catch (e) {
      console.error('Fatal error during setSession from URL:', e);
    } finally {
      // Clean the URL hash regardless of success or failure before Angular router takes over
      window.location.hash = '';
    }
  }
}

/**
 * Main function to bootstrap the Angular application.
 */
function bootstrap() {
  try {
    bootstrapApplication(AppComponent, {
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(APP_ROUTES, withHashLocation()),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    });
  } catch (err) {
    console.error('Failed to bootstrap the application:', err);
  }
}

/**
 * Orchestrates the application startup.
 * 1. Checks for and handles URL-based authentication tokens.
 * 2. Bootstraps the Angular application.
 */
async function main() {
  await handleUrlTokenAuthentication();
  bootstrap();
}

// Start the application bootstrap process.
main();

// AI Studio always uses an `index.tsx` file for all project types.
