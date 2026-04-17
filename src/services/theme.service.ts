import { Injectable, signal, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'chefos-theme';
  private document = inject(DOCUMENT);
  
  // Create a reactive signal for the current theme. Default to dark for consistency in this session
  public readonly currentTheme = signal<Theme>('dark'); 

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
    } else {
      this.setTheme('dark');
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
}
