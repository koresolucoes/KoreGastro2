
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideZonelessChangeDetection, LOCALE_ID } from '@angular/core';
import { registerLocaleData, DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';

// Register the locale data for pt-BR
registerLocaleData(localePt);

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(APP_ROUTES, withHashLocation()),
    // Set the default locale for the application
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    // Provide DatePipe at the root level so it can be injected
    DatePipe,
    CurrencyPipe,
    DecimalPipe,
  ],
}).catch(err => console.error(err));