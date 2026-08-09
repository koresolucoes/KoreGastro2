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
import { SubscriptionStateService } from '../../services/subscription-state.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ThemeService } from '../../services/theme.service';
import { IfoodDataService } from '../../services/ifood-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { supabase } from '../../services/supabase-client';
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
  private subscriptionState = inject(SubscriptionStateService);
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
    managerName: 'Gerente Geral',
    managerPin: '1234',
    ifoodMerchantId: '',
  };

  steps = [
    { id: 'identity', title: 'Identidade' },
    { id: 'template', title: 'Modelo de Negócio' },
    { id: 'theme', title: 'Personalização' },
    { id: 'structure', title: 'Estrutura' },
    { id: 'dishes_guide', title: 'Cardápio & Pratos' },
    { id: 'manager', title: 'Gerente Geral' },
    { id: 'ifood', title: 'Conectividade' },
    { id: 'finish', title: 'Conclusão' }
  ];

  stepImages = [
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1974&auto=format&fit=crop', // Step 0: Identity
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1974&auto=format&fit=crop', // Step 1: Model
    'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?q=80&w=1974&auto=format&fit=crop', // Step 2: Theme
    'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?q=80&w=2070&auto=format&fit=crop', // Step 3: Structure
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=1974&auto=format&fit=crop', // Step 4: Dishes Guide
    'https://images.unsplash.com/photo-1556742049-0a67568d049f?q=80&w=1974&auto=format&fit=crop', // Step 5: Manager
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1981&auto=format&fit=crop', // Step 6: iFood
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=1974&auto=format&fit=crop'  // Step 7: Finish
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
        break;
      case 'pizza':
        this.data.tableCount = 20;
        this.data.stations = ['Forno', 'Pizzaiolo', 'Embalagem'];
        break;
      case 'bar':
        this.data.tableCount = 25;
        this.data.stations = ['Bar', 'Cozinha'];
        break;
      case 'cafe':
        this.data.tableCount = 10;
        this.data.stations = ['Barista', 'Forno'];
        break;
      case 'restaurant':
        this.data.tableCount = 30;
        this.data.stations = ['Pratos Quentes', 'Saladas', 'Sobremesas', 'Bar'];
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
      if (next === 7) {
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
      case 0: return !!this.data.companyName.trim(); 
      case 1: return true; 
      case 2: return true; 
      case 3: return this.data.tableCount > 0;
      case 4: return true; // Cardápio & Pratos guide step
      case 5: return !!this.data.managerName.trim() && !!this.data.managerPin.trim() && this.data.managerPin.trim().length >= 4;
      case 6: return true; // ifood is optional
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
    this.currentStep.set(7); 
    this.isProcessing.set(true);
    this.startLoadingAnimation();

    try {
      // 1. Setup Company
      const companyRes = await this.settingsData.updateCompanyProfile({
        company_name: this.data.companyName,
        cnpj: '',
        ifood_merchant_id: this.data.ifoodMerchantId || null
      } as any);
      if (!companyRes.success) throw new Error(companyRes.error?.message || 'Erro ao configurar empresa');

      // 2. Setup Hall
      const hall = await this.posData.addHall('Salão Principal');
      if (!hall.success) throw new Error(hall.error?.message || 'Erro ao criar salão');
      
      if (hall.success && hall.data?.id) {
          await this.posData.deleteTablesByHallId(hall.data.id);
          // add tables manually
          const tables: any[] = [];
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
          const tablesRes = await this.posData.upsertTables(tables);
          if (!tablesRes.success) throw new Error(tablesRes.error?.message || 'Erro ao criar mesas');
      }

      // 3. Setup Stations
      for (const s of this.data.stations) {
          const stationRes = await this.settingsData.addStation(s);
          if (!stationRes.success) throw new Error(stationRes.error?.message || 'Erro ao criar praça');
      }

      // 4. Setup Base Menu (Empty, user will create dishes inside system)
      const activeUnitId = this.settingsData.getActiveUnitId();
      if (!activeUnitId) throw new Error('Nenhuma unidade ativa encontrada para criar o cardápio');

      const { data: existingMenu } = await supabase.from('menus').select('id').eq('user_id', activeUnitId).eq('name', 'Cardápio Principal').maybeSingle();
      let menuId = existingMenu?.id || uuidv4();
      
      const menuRes = await this.menuData.saveMenu({ id: menuId, name: 'Cardápio Principal', type: 'pdv', is_active: true });
      if (!menuRes.success) {
        console.warn('Aviso ao inicializar cardápio base:', menuRes.error);
      }

      // 5. Setup Default Roles & Default Manager Employee with ALL permissions
      let gerenteRole = this.hrState.roles().find(r => r.name.toLowerCase().includes('gerente') || r.name.toLowerCase().includes('admin'));
      if (!gerenteRole) {
        const { data: dbRoles } = await supabase.from('roles').select('*').eq('user_id', activeUnitId);
        gerenteRole = dbRoles?.find((r: any) => r.name.toLowerCase().includes('gerente') || r.name.toLowerCase().includes('admin'));
      }
      if (!gerenteRole) {
        const roleRes = await this.settingsData.addRole('Gerente');
        if (roleRes.success && roleRes.data) {
          gerenteRole = roleRes.data;
        }
      }

      // CRITICAL: Grant ALL permissions to the Gerente role
      if (gerenteRole?.id) {
        await this.settingsData.grantAllPermissionsToRole(gerenteRole.id);
      }

      // Add default secondary roles if missing
      const defaultRoleNames = ['Caixa', 'Garçom', 'Cozinha'];
      for (const rName of defaultRoleNames) {
        const existsLocally = this.hrState.roles().some(r => r.name === rName);
        if (!existsLocally) {
          const { data: existingRoleInDb } = await supabase.from('roles').select('id').eq('user_id', activeUnitId).eq('name', rName).maybeSingle();
          if (!existingRoleInDb) {
            await this.settingsData.addRole(rName);
          }
        }
      }

      // Create or update default Manager employee with the name and pin entered by user
      const managerNameInput = (this.data.managerName || '').trim() || 'Gerente Geral';
      const managerPinInput = (this.data.managerPin || '').trim() || '1234';

      const { data: existingEmployees } = await supabase.from('employees').select('id, name').eq('user_id', activeUnitId);
      let activeEmp = existingEmployees?.find((e: any) => e.role_id === gerenteRole?.id || e.name === managerNameInput) || existingEmployees?.[0];

      if (!activeEmp) {
        const empRes = await this.settingsData.addEmployee({
          name: managerNameInput,
          pin: managerPinInput,
          role_id: gerenteRole?.id || null
        });
        if (empRes.success && empRes.data) {
          activeEmp = empRes.data;
        }
      } else {
        await this.settingsData.updateEmployee({
          id: activeEmp.id,
          name: managerNameInput,
          pin: managerPinInput,
          role_id: gerenteRole?.id || activeEmp.role_id
        });
        activeEmp = {
          ...activeEmp,
          name: managerNameInput,
          pin: managerPinInput,
          role_id: gerenteRole?.id || activeEmp.role_id
        };
      }

      // Reload main app data & permissions so state is 100% synchronized
      await this.supabaseState.loadCoreData(activeUnitId);
      await this.supabaseState.loadEssentialData(activeUnitId);
      await this.subscriptionState.loadSubscriptionForUnit(activeUnitId);

      // Automatically login the manager operator
      const freshManager = this.hrState.employees().find(e => e.id === activeEmp?.id) || activeEmp;
      if (freshManager) {
        this.opAuth.login(freshManager);
      }

      // Brief pause for UI transition
      await new Promise(r => setTimeout(r, 1500));

      this.router.navigate(['/dashboard']);
    } catch (e: any) {
        console.error('Onboarding Error:', e);
        this.notification.show(`Erro na configuração: ${e.message}`, 'error');
        this.currentStep.set(6); 
    } finally {
        this.isProcessing.set(false);
        if (this.loadingInterval) clearInterval(this.loadingInterval);
    }
  }
}
