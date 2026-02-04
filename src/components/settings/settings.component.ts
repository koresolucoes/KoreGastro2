
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// Import new modular components
import { CompanySettingsComponent } from './company-settings/company-settings.component';
import { OperationSettingsComponent } from './operation-settings/operation-settings.component';
import { FunctionalitySettingsComponent } from './functionality-settings/functionality-settings.component';
import { SecuritySettingsComponent } from './security-settings/security-settings.component';
import { MultiUnitSettingsComponent } from './multi-unit-settings/multi-unit-settings.component';
import { StoreManagementComponent } from './store-management/store-management.component';

type SettingsTab = 'empresa' | 'stores' | 'cadastros' | 'funcionalidades' | 'seguranca' | 'equipe';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    CompanySettingsComponent,
    OperationSettingsComponent,
    FunctionalitySettingsComponent,
    SecuritySettingsComponent,
    MultiUnitSettingsComponent,
    StoreManagementComponent
  ],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  activeTab = signal<SettingsTab>('empresa');
}
