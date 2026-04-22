import { Injectable, signal, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Theme = 'light' | 'dark';
export type Palette = 'chefos' | 'napoli' | 'kyoto' | 'oaxaca' | 'lyon' | 'bangkok';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'chefos-theme';
  private readonly PALETTE_KEY = 'chefos-palette';
  private document = inject(DOCUMENT);
  
  // Create reactive signals
  public readonly currentTheme = signal<Theme>('dark'); 
  public readonly currentPalette = signal<Palette>('chefos');

  constructor() {
    this.initializeTheme();
  }

  private initializeTheme() {
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem(this.THEME_KEY) as Theme;
      if (savedTheme) {
        this.setTheme(savedTheme);
      } else {
        // Default behavior: check OS preference or default to dark
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.setTheme(prefersDark ? 'dark' : 'light');
      }

      const savedPalette = localStorage.getItem(this.PALETTE_KEY) as Palette;
      if (savedPalette) {
        this.setPalette(savedPalette);
      } else {
        this.setPalette('chefos');
      }
    } else {
      this.setTheme('dark');
      this.setPalette('chefos');
    }
  }

  public toggleTheme() {
    const newTheme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  public setTheme(theme: Theme) {
    this.currentTheme.set(theme);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.THEME_KEY, theme);
    }
    
    // Apply changes to HTML root element safely to avoid Tailwind Dark Mode collisions
    this.document.documentElement.setAttribute('data-theme', theme);
  }

  public setPalette(palette: Palette) {
    this.currentPalette.set(palette);
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.PALETTE_KEY, palette);
    }

    if (palette === 'chefos') {
        this.document.documentElement.removeAttribute('data-palette');
    } else {
        this.document.documentElement.setAttribute('data-palette', palette);
    }
  }
}

