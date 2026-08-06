import { Component, ChangeDetectionStrategy, signal, inject, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsDataService } from '../../services/settings-data.service';
import { MenuDataService } from '../../services/menu-data.service';
import { MenuCategory, MenuItem } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoModeService } from '../../services/demo-mode.service';
import { HrStateService } from '../../services/hr-state.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ThemeService } from '../../services/theme.service';
import { IfoodDataService } from '../../services/ifood-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { v4 as uuidv4 } from 'uuid';

type BusinessTemplate = 'burger' | 'pizza' | 'bar' | 'cafe' | 'restaurant';
type ThemeOption = 'midnight' | 'pearl' | 'spice' | 'slate';

type TemplateCategory = { name: string, items: { name: string, price: number }[] };

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private hrState = inject(HrStateService);
  private settingsData = inject(SettingsDataService);
  private menuData = inject(MenuDataService);
  private notification = inject(NotificationService);
  private opAuth = inject(OperationalAuthService);
  private demoMode = inject(DemoModeService);
  private supabaseState = inject(SupabaseStateService);
  private posData = inject(PosDataService);
  themeService = inject(ThemeService);
  ifoodData = inject(IfoodDataService);

  currentStep = signal(0);
  isProcessing = signal(false);
  
  // iFood Integration State
  ifoodConnecting = signal(false);
  ifoodConnected = signal(false);
  ifoodUserCode = signal('');
  ifoodAuthCode = signal('');
  ifoodCodeData: any = null;

  // Form Data
  data = {
    companyName: '',
    logoUrl: '',
    selectedTemplate: 'burger' as BusinessTemplate,
    selectedTheme: 'midnight' as ThemeOption,
    tableCount: 15,
    stations: [] as string[],
    menuCategories: [] as TemplateCategory[],
    managerName: 'Administrador',
    managerPin: '1234',
    ifoodMerchantId: '',
  };

  steps = [
    { id: 'identity', title: 'Identidade' },
    { id: 'template', title: 'Modelo de Negócio' },
    { id: 'theme', title: 'Personalização' },
    { id: 'structure', title: 'Estrutura' },
    { id: 'ifood', title: 'Conectividade' },
    { id: 'finish', title: 'Conclusão' }
  ];

  stepImages = [
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1974&auto=format&fit=crop', // Step 0: Identity
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1974&auto=format&fit=crop', // Step 1: Model
    'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?q=80&w=1974&auto=format&fit=crop', // Step 2: Theme
    'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?q=80&w=2070&auto=format&fit=crop', // Step 3: Structure
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1981&auto=format&fit=crop', // Step 4: iFood
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=1974&auto=format&fit=crop'  // Step 5: Finish
  ];

  templates = [
    { id: 'burger', icon: 'lunch_dining', title: 'Hamburgueria', desc: 'Focado em delivery e balcão, produção rápida.', theme: 'oaxaca' },
    { id: 'pizza', icon: 'local_pizza', title: 'Pizzaria', desc: 'Mesas, delivery, fornos e montagem complexa.', theme: 'napoli' },
    { id: 'bar', icon: 'sports_bar', title: 'Bar / Pub', desc: 'Foco em bebidas, porções e alto giro de mesas.', theme: 'dark' },
    { id: 'cafe', icon: 'local_cafe', title: 'Café / Padaria', desc: 'Balcão ágil, vitrine e preparo expresso.', theme: 'light' },
    { id: 'restaurant', icon: 'restaurant', title: 'Restaurante Geral', desc: 'Pratos elaborados, salão estruturado.', theme: 'kyoto' }
  ];

  themes = [
    { id: 'light', name: 'Claro (Padrão)', desc: 'Branco com detalhes vivos.', class: 'theme-light' },
    { id: 'dark', name: 'Escuro', desc: 'Preto luxuoso e elegante.', class: 'theme-dark' },
    { id: 'napoli', name: 'Nápoles (Rosé)', desc: 'Tons de vermelho clássico.', class: 'theme-napoli' },
    { id: 'kyoto', name: 'Kyoto (Matcha)', desc: 'Tons esverdeados de chá.', class: 'theme-kyoto' },
    { id: 'oaxaca', name: 'Oaxaca (Terracotta)', desc: 'Ambar e temperos quentes.', class: 'theme-oaxaca' }
  ];

  loadingTexts = [
    'Acendendo os fornos...',
    'Arrumando as mesas...',
    'Limpando o balcão...',
    'Preparando o cardápio...',
    'Afiando as facas...'
  ];
  currentLoadingText = signal(this.loadingTexts[0]);
  private loadingInterval: any;

  ngOnInit() {
    this.applyTemplate('burger');
  }

  ngOnDestroy() {
    if (this.loadingInterval) clearInterval(this.loadingInterval);
  }

  applyTemplate(templateId: BusinessTemplate) {
    this.data.selectedTemplate = templateId;
    const tmpl = this.templates.find(t => t.id === templateId);
    if (tmpl) this.applyTheme(tmpl.theme as ThemeOption);
    
    switch(templateId) {
      case 'burger':
        this.data.tableCount = 15;
        this.data.stations = ['Chapa', 'Fritadeira', 'Montagem'];
        this.data.menuCategories = [
          { name: 'Burgers', items: [{name: 'Cheeseburger', price: 28}, {name: 'Double Bacon', price: 38}] },
          { name: 'Porções', items: [{name: 'Batata Frita', price: 18}] },
          { name: 'Bebidas', items: [{name: 'Coca-Cola', price: 7}] }
        ];
        break;
      case 'pizza':
        this.data.tableCount = 20;
        this.data.stations = ['Forno', 'Pizzaiolo', 'Embalagem'];
        this.data.menuCategories = [
          { name: 'Tradicionais', items: [{name: 'Marguerita (G)', price: 65}, {name: 'Calabresa (G)', price: 60}] },
          { name: 'Doces', items: [{name: 'Chocolate com Morango', price: 70}] },
          { name: 'Bebidas', items: [{name: 'Guaraná 2L', price: 15}] }
        ];
        break;
      case 'bar':
        this.data.tableCount = 25;
        this.data.stations = ['Bar', 'Cozinha'];
        this.data.menuCategories = [
          { name: 'Chopp', items: [{name: 'Chopp Pilsen', price: 12}, {name: 'Chopp IPA', price: 18}] },
          { name: 'Drinks', items: [{name: 'Caipirinha', price: 25}, {name: 'Gin Tônica', price: 30}] },
          { name: 'Petiscos', items: [{name: 'Isca de Frango', price: 45}] }
        ];
        break;
      case 'cafe':
        this.data.tableCount = 10;
        this.data.stations = ['Barista', 'Forno'];
        this.data.menuCategories = [
          { name: 'Cafés', items: [{name: 'Espresso', price: 7}, {name: 'Cappuccino', price: 14}] },
          { name: 'Salgados', items: [{name: 'Pão de Queijo', price: 8}] },
          { name: 'Doces', items: [{name: 'Bolo de Cenoura', price: 12}] }
        ];
        break;
      case 'restaurant':
        this.data.tableCount = 30;
        this.data.stations = ['Pratos Quentes', 'Saladas', 'Sobremesas', 'Bar'];
        this.data.menuCategories = [
          { name: 'Principais', items: [{name: 'Parmegiana', price: 55}, {name: 'Salmão', price: 70}] },
          { name: 'Entradas', items: [{name: 'Bruschetta', price: 25}] },
          { name: 'Bebidas', items: [{name: 'Suco Natural', price: 12}] }
        ];
        break;
    }
  }

  applyTheme(themeId: ThemeOption) {
    this.data.selectedTheme = themeId;
    if (themeId === 'midnight') {
        this.themeService.setTheme('dark');
        this.themeService.setPalette('chefos');
    } else if (themeId === 'pearl') {
        this.themeService.setTheme('light');
        this.themeService.setPalette('lyon');
    } else if (themeId === 'spice') {
        this.themeService.setTheme('light');
        this.themeService.setPalette('napoli');
    } else if (themeId === 'slate') {
        this.themeService.setTheme('light');
        this.themeService.setPalette('kyoto');
    }
  }

  async startIfoodAuth() {
    this.ifoodConnecting.set(true);
    try {
      const res = await fetch('/api/ifood-oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'userCode' })
      });
      const data = await res.json();
      
      if (!res.ok) {
          throw new Error(data.message || 'Erro ao iniciar autorização');
      }
      
      this.ifoodUserCode.set(data.userCode);
      // We store the whole data object to have the verifier for the next step
      this.ifoodCodeData = data;
      // Option to open portal
      window.open('https://portal.ifood.com.br/app/integracoes', '_blank');
    } catch (e: any) {
      this.notification.show('Erro ao iniciar integração com iFood: ' + e.message, 'error');
    } finally {
      this.ifoodConnecting.set(false);
    }
  }

  async verifyIfoodAuth() {
    if (!this.ifoodAuthCode()) {
      this.notification.show('Informe o código de autorização.', 'warning');
      return;
    }
    this.ifoodConnecting.set(true);
    try {
      const res = await fetch('/api/ifood-oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              action: 'token',
              authorizationCode: this.ifoodAuthCode(),
              authorizationCodeVerifier: this.ifoodCodeData?.authorizationCodeVerifier
          })
      });
      const data = await res.json();
      
      if (!res.ok) {
          throw new Error(data.message || 'Erro ao validar autorização');
      }

      this.data.ifoodMerchantId = data.tenantId || 'IFOOD_CONNECTED';
      this.ifoodConnected.set(true);
      this.notification.show('iFood conectado com sucesso!', 'success');
    } catch (e: any) {
      this.notification.show('Código inválido ou expirado: ' + e.message, 'error');
    } finally {
      this.ifoodConnecting.set(false);
    }
  }

  nextStep() {
    if (this.isStepValid()) {
      const next = this.currentStep() + 1;
      this.currentStep.set(next);
      if (next === 5) {
        this.finish();
      }
    }
  }

  prevStep() {
    if (this.currentStep() > 0) {
      this.currentStep.update(v => v - 1);
    }
  }

  isStepValid(): boolean {
    switch (this.currentStep()) {
      case 0: return !!this.data.companyName; 
      case 1: return true; 
      case 2: return true; 
      case 3: return this.data.tableCount > 0;
      case 4: return true; // ifood is optional
      default: return false;
    }
  }

  startLoadingAnimation() {
    let index = 0;
    this.loadingInterval = setInterval(() => {
      index = (index + 1) % this.loadingTexts.length;
      this.currentLoadingText.set(this.loadingTexts[index]);
    }, 1500);
  }

  async finish() {
    this.currentStep.set(5); 
    this.isProcessing.set(true);
    this.startLoadingAnimation();

    try {
      // 1. Setup Company
      await this.settingsData.updateCompanyProfile({
        company_name: this.data.companyName,
        cnpj: '',
        ifood_merchant_id: this.data.ifoodMerchantId || null
      } as any);

      // 3. Setup Hall
      const hall = await this.posData.addHall('Salão Principal');
      if (hall.success && hall.data?.id) {
          // add tables manually
          const tables = [];
          for (let i = 1; i <= this.data.tableCount; i++) {
              tables.push({
                 id: uuidv4(),
                 hall_id: hall.data.id,
                 number: i,
                 name: `Mesa ${i}`,
                 is_active: true,
                 x: ((i - 1) % 5) * 150 + 50,
                 y: Math.floor((i - 1) / 5) * 150 + 50
              });
          }
          await this.posData.upsertTables(tables);
      }

      // 4. Setup Stations
      for (const s of this.data.stations) {
          await this.settingsData.addStation(s);
      }

      // 5. Setup Menu
      let order = 0;
      for (const cat of this.data.menuCategories) {
          const categoryId = uuidv4();
          await this.menuData.saveCategory({ id: categoryId, name: cat.name, display_order: order++ });
          for (const item of cat.items) {
              await this.menuData.saveItem({
                  id: uuidv4(),
                  menu_category_id: categoryId,
                  custom_name: item.name,
                  custom_price: item.price || 0,
                  is_active: true
              });
          }
      }

      // Simulate network delay for effect
      await new Promise(r => setTimeout(r, 4500));

      this.router.navigate(['/pos']);
    } catch (e: any) {
        console.error('Onboarding Error:', e);
        this.notification.show(`Erro na configuração: ${e.message}`, 'error');
        this.currentStep.set(4); 
    } finally {
        this.isProcessing.set(false);
        if (this.loadingInterval) clearInterval(this.loadingInterval);
    }
  }
}
