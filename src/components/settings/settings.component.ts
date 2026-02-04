
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

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
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  activeTab = signal<SettingsTab>('empresa');

  constructor() {
    // Read initial tab from URL query params
    const tabFromUrl = this.route.snapshot.queryParamMap.get('tab') as SettingsTab;
    if (tabFromUrl && ['empresa', 'stores', 'cadastros', 'funcionalidades', 'seguranca', 'equipe'].includes(tabFromUrl)) {
        this.activeTab.set(tabFromUrl);
    }
  }

  selectTab(tab: SettingsTab) {
    this.activeTab.set(tab);
    // Update URL without reloading the page to persist state
    this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: tab },
        queryParamsHandling: 'merge', // keep other params if any
        replaceUrl: true // don't clutter browser history
    });
  }
}
