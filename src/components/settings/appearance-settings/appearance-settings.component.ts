import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, Theme, Palette } from '../../../services/theme.service';

@Component({
  selector: 'app-appearance-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './appearance-settings.component.html'
})
export class AppearanceSettingsComponent {
  themeService = inject(ThemeService);

  readonly palettes = [
    { id: 'chefos', name: 'Chef OS', color: '#ea580c', description: 'O clássico Chef OS em Laranja e Titânio.' }, // Orange
    { id: 'napoli', name: 'Nápoles', color: '#e11d48', description: 'Vibrante e clássico, inspirado no tomate San Marzano.' }, // Rose
    { id: 'kyoto', name: 'Kyoto', color: '#16a34a', description: 'Calmo e minimalista, tons de Chá Verde Matcha.' }, // Green
    { id: 'oaxaca', name: 'Oaxaca', color: '#d97706', description: 'Quente e terroso, lembrando pimentas e temperos.' }, // Amber
    { id: 'lyon', name: 'Lyon', color: '#831843', description: 'Sofisticado e elegante, baseado em vinhos Bordeaux.' }, // Pink
    { id: 'bangkok', name: 'Bangkok', color: '#ca8a04', description: 'Elétrico e noturno, o brilho das ruas asiáticas.' } // Yellow
  ] as const;

  setTheme(theme: Theme) {
    this.themeService.setTheme(theme);
  }

  setPalette(palette: Palette) {
    this.themeService.setPalette(palette);
  }
}
