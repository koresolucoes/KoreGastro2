import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// Import new modular components
import { CompanySettingsComponent } from './company-settings/company-settings.component';
import { OperationSettingsComponent } from './operation-settings/operation-settings.component';
import { FunctionalitySettingsComponent } from './functionality-settings/functionality-settings.component';
import { SecuritySettingsComponent } from './security-settings/security-settings.component';

type SettingsTab = 'empresa' | 'cadastros' | 'funcionalidades' | 'seguranca';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    CompanySettingsComponent,
    OperationSettingsComponent,
    FunctionalitySettingsComponent,
    SecuritySettingsComponent
  ],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  activeTab = signal<SettingsTab>('empresa');
}