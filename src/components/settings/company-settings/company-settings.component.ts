import { Component, ChangeDetectionStrategy, inject, signal, effect, ViewChild, ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CompanyProfile } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { SettingsStateService } from '../../../services/settings-state.service';
import { SubscriptionStateService } from '../../../services/subscription-state.service';
import { FocusNFeService } from '../../../services/focus-nfe.service';

declare var L: any; // Declare Leaflet

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './company-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySettingsComponent {
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private settingsState = inject(SettingsStateService);
  private subscriptionState = inject(SubscriptionStateService);
  private focusNFeService = inject(FocusNFeService);

  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map: any;
  private marker: any;
  private circle: any;
  private mapInitialized = false;

  companyProfile = this.settingsState.companyProfile;
  subscription = this.subscriptionState.subscription;
  currentPlan = this.subscriptionState.currentPlan;
  trialDaysRemaining = this.subscriptionState.trialDaysRemaining;

  companyProfileForm = signal<Partial<CompanyProfile>>({});
  logoFile = signal<File | null>(null);
  logoPreviewUrl = signal<string | null>(null);
  coverFile = signal<File | null>(null);
  coverPreviewUrl = signal<string | null>(null);
  headerFile = signal<File | null>(null);
  headerPreviewUrl = signal<string | null>(null);
  isPlanModalOpen = signal(false);
  isConsultingCnpj = signal(false);

  isCnpjValid = computed(() => {
    const cnpj = this.companyProfileForm().cnpj || '';
    return cnpj.replace(/[^\d]/g, '').length === 14;
  });

  constructor() {
    effect(() => {
        const profile = this.companyProfile();
        if (profile) {
            this.companyProfileForm.set({ ...profile });
            this.logoPreviewUrl.set(profile.logo_url);
            this.coverPreviewUrl.set(profile.menu_cover_url);
            this.headerPreviewUrl.set(profile.menu_header_url);
        } else {
            this.companyProfileForm.set({ company_name: '', cnpj: '', address: '', phone: '', ifood_merchant_id: null});
        }
    });

    effect(() => {
        if (!this.mapInitialized) {
            setTimeout(() => {
                if (this.mapContainer?.nativeElement) {
                    this.initMap();
                }
            }, 0);
        }
        
        const profile = this.companyProfileForm();
        if (this.mapInitialized && this.map) {
            const lat = profile.latitude ?? -15.793889;
            const lon = profile.longitude ?? -47.882778;
            const radius = profile.time_clock_radius ?? 100;
            const latLng = L.latLng(lat, lon);

            if (this.marker) this.marker.setLatLng(latLng);
            if (this.circle) {
                this.circle.setLatLng(latLng);
                this.circle.setRadius(radius);
            }
            
            const currentCenter = this.map.getCenter();
            if (currentCenter.distanceTo(latLng) > 1) {
                this.map.flyTo(latLng, this.map.getZoom());
            }
        }
    });
  }

  private initMap(): void {
    if (this.map || !this.mapContainer?.nativeElement) {
        return;
    }

    const profile = this.companyProfileForm();
    const lat = profile.latitude ?? -15.793889;
    const lon = profile.longitude ?? -47.882778;
    const radius = profile.time_clock_radius ?? 100;

    this.map = L.map(this.mapContainer.nativeElement).setView([lat, lon], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.marker = L.marker([lat, lon]).addTo(this.map);

    this.circle = L.circle([lat, lon], {
        color: 'blue',
        fillColor: '#3b82f6',
        fillOpacity: 0.3,
        radius: radius
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
        const newLat = e.latlng.lat;
        const newLng = e.latlng.lng;
        
        this.companyProfileForm.update(form => ({
            ...form,
            latitude: newLat,
            longitude: newLng,
        }));
    });

    this.mapInitialized = true;
  }
  
  updateCompanyProfileField(field: keyof Omit<CompanyProfile, 'user_id' | 'created_at' | 'logo_url' | 'menu_cover_url' | 'menu_header_url'>, value: string) {
      this.companyProfileForm.update(form => ({ ...form, [field]: value }));
  }
  
  handleLogoFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.logoFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.logoPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  handleCoverFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.coverFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.coverPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  handleHeaderFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.headerFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.headerPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }
  
  async saveCompanyProfile() {
      const profileForm = this.companyProfileForm();
      if (!profileForm.company_name || !profileForm.cnpj) {
          await this.notificationService.alert('Nome da Empresa e CNPJ são obrigatórios.');
          return;
      }
      
      const { success, error } = await this.settingsDataService.updateCompanyProfile(profileForm, this.logoFile(), this.coverFile(), this.headerFile());

      if (success) {
          await this.notificationService.alert('Dados da empresa salvos com sucesso!', 'Sucesso');
          this.logoFile.set(null);
          this.coverFile.set(null);
          this.headerFile.set(null);
      } else {
          await this.notificationService.alert(`Falha ao salvar. Erro: ${error?.message}`);
      }
  }

  async consultarCnpj() {
    const cnpj = this.companyProfileForm().cnpj;
    if (!this.isCnpjValid()) {
        this.notificationService.show('Por favor, insira um CNPJ com 14 dígitos.', 'warning');
        return;
    }

    this.isConsultingCnpj.set(true);
    try {
        const { success, data, error } = await this.focusNFeService.consultarCnpj(cnpj!);
        if (success && data) {
            this.companyProfileForm.update(form => {
                const newForm = { ...form };
                newForm.company_name = data.razao_social || form.company_name;

                if (data.endereco) {
                    const { logradouro, numero, complemento, bairro, nome_municipio, uf, cep } = data.endereco;
                    let fullAddress = logradouro || '';
                    if (numero) fullAddress += `, ${numero}`;
                    if (bairro) fullAddress += `, ${bairro}`;
                    if (complemento) fullAddress += ` - ${complemento}`;
                    if (nome_municipio && uf) fullAddress += ` - ${nome_municipio}/${uf}`;
                    if (cep) fullAddress += `, CEP: ${cep}`;
                    newForm.address = fullAddress.trim();
                }
                
                return newForm;
            });
            this.notificationService.show('Dados do CNPJ preenchidos com sucesso!', 'success');
        } else {
            throw error || new Error('Resposta inesperada da API.');
        }
    } catch (e: any) {
        this.notificationService.show(`Erro ao consultar CNPJ: ${e.message}`, 'error');
    } finally {
        this.isConsultingCnpj.set(false);
    }
  }
}
