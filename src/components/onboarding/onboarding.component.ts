
import { Component, ChangeDetectionStrategy, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsDataService } from '../../services/settings-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { NotificationService } from '../../services/notification.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { UnitContextService } from '../../services/unit-context.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoModeService } from '../../services/demo-mode.service';
import { HrStateService } from '../../services/hr-state.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ThemeService } from '../../services/theme.service';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../services/supabase-client';

interface MenuCategoryItem {
    name: string;
    price: number | null;
}

interface MenuCategory {
    name: string;
    items: MenuCategoryItem[];
}

type BusinessTemplate = 'burger' | 'pizza' | 'bar' | 'restaurant' | 'cafe' | 'custom';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
  private router = inject(Router);
  private hrState = inject(HrStateService);
  private settingsData = inject(SettingsDataService);
  private recipeData = inject(RecipeDataService);
  private posData = inject(PosDataService);
  private inventoryData = inject(InventoryDataService);
  private unitContext = inject(UnitContextService);
  private notification = inject(NotificationService);
  private opAuth = inject(OperationalAuthService);
  private demoMode = inject(DemoModeService);
  private supabaseState = inject(SupabaseStateService);
  themeService = inject(ThemeService);

  currentStep = signal(0);
  isProcessing = signal(false);
  loadingStatus = signal('Iniciando...');
  
  ifoodConnecting = signal(false);
  ifoodConnected = signal(false);

  // Form Data Complex Object
  data = {
    companyName: '',
    cnpj: '',
    selectedTemplate: 'burger' as BusinessTemplate,
    
    // Auto-filled by template
    hasWaiters: true,
    hasKitchen: true,
    hasDrivers: true,
    hasCashiers: true,
    hallName: 'Salão Principal',
    tableCount: 10,
    stations: ['Cozinha'] as string[],
    menuCategories: [] as MenuCategory[],

    // Integrations
    ifoodMerchantId: '',
    ifoodOAuthCode: '',

    // Acesso
    managerName: '',
    managerPin: ''
  };

  steps = [
    { id: 'welcome', title: 'Boas-vindas' },
    { id: 'template', title: 'Seu Negócio' },
    { id: 'theme', title: 'Identidade' },
    { id: 'integrations', title: 'Integrações' },
    { id: 'manager', title: 'Acesso' },
    { id: 'trial', title: 'Premium' },
    { id: 'finish', title: 'Conclusão' }
  ];

  templates = [
    { id: 'burger', icon: 'lunch_dining', title: 'Hamburgueria', desc: 'Focado em delivery e balcão, produção rápida.' },
    { id: 'pizza', icon: 'local_pizza', title: 'Pizzaria', desc: 'Mesas, delivery, fornos e montagem complexa.' },
    { id: 'bar', icon: 'sports_bar', title: 'Bar / Pub', desc: 'Foco em bebidas, porções e alto giro de mesas.' },
    { id: 'restaurant', icon: 'restaurant', title: 'Restaurante', desc: 'Pratos elaborados, salão estruturado.' },
    { id: 'cafe', icon: 'local_cafe', title: 'Cafeteria', desc: 'Balcão ágil, vitrine e preparo expresso.' }
  ];

  themes = [
    { id: 'dark', name: 'Escuro (Premium)', desc: 'Elegante, moderno e reduz o cansaço visual. Ideal para bares e hamburguerias.', icon: 'dark_mode' },
    { id: 'light', name: 'Claro (Clean)', desc: 'Limpo, clássico e de alta visibilidade. Excelente para restaurantes diurnos e cafés.', icon: 'light_mode' }
  ];

  ngOnInit() {
    this.applyTemplate('burger'); // Default
  }

  applyTemplate(templateId: BusinessTemplate) {
    this.data.selectedTemplate = templateId;
    
    switch(templateId) {
      case 'burger':
        this.data.tableCount = 8;
        this.data.stations = ['Chapa', 'Fritadeira', 'Montagem', 'Bebidas'];
        this.data.menuCategories = [
          { name: 'Burgers Clássicos', items: [{name: 'Cheeseburger', price: 28}, {name: 'Double Bacon', price: 38}] },
          { name: 'Porções', items: [{name: 'Batata Frita', price: 18}] },
          { name: 'Bebidas', items: [{name: 'Coca-Cola', price: 7}] }
        ];
        break;
      case 'pizza':
        this.data.tableCount = 15;
        this.data.stations = ['Forno', 'Montagem', 'Bebidas'];
        this.data.menuCategories = [
          { name: 'Pizzas Tradicionais', items: [{name: 'Marguerita (G)', price: 65}, {name: 'Calabresa (G)', price: 60}] },
          { name: 'Bebidas', items: [{name: 'Guaraná 2L', price: 15}] }
        ];
        break;
      case 'bar':
        this.data.tableCount = 20;
        this.data.stations = ['Bar', 'Cozinha'];
        this.data.menuCategories = [
          { name: 'Chopp & Cervejas', items: [{name: 'Chopp Pilsen 300ml', price: 12}, {name: 'Heineken 600ml', price: 18}] },
          { name: 'Drinks', items: [{name: 'Caipirinha', price: 25}, {name: 'Gin Tônica', price: 30}] },
          { name: 'Petiscos', items: [{name: 'Isca de Frango', price: 45}] }
        ];
        break;
      case 'restaurant':
        this.data.tableCount = 12;
        this.data.stations = ['Pratos Quentes', 'Saladas', 'Sobremesas', 'Bar'];
        this.data.menuCategories = [
          { name: 'Pratos Principais', items: [{name: 'Parmegiana de Carne', price: 55}, {name: 'Salmão Grelhado', price: 70}] },
          { name: 'Entradas', items: [{name: 'Bruschetta', price: 25}] },
          { name: 'Bebidas', items: [{name: 'Suco Natural', price: 12}] }
        ];
        break;
      case 'cafe':
        this.data.tableCount = 6;
        this.data.stations = ['Expresso', 'Vitrine'];
        this.data.menuCategories = [
          { name: 'Cafés Quentes', items: [{name: 'Espresso', price: 7}, {name: 'Cappuccino', price: 14}] },
          { name: 'Doces & Salgados', items: [{name: 'Pão de Queijo', price: 8}, {name: 'Bolo de Cenoura', price: 12}] }
        ];
        break;
    }
  }

  setTheme(themeId: string) {
    if (themeId === 'dark') {
      this.themeService.enableDarkMode();
    } else {
      this.themeService.enableLightMode();
    }
  }

  simulateIfoodAuth() {
    this.ifoodConnecting.set(true);
    setTimeout(() => {
      this.ifoodConnecting.set(false);
      this.ifoodConnected.set(true);
      this.data.ifoodMerchantId = uuidv4().substring(0, 8).toUpperCase();
      this.data.ifoodOAuthCode = 'auth_ok';
      this.notification.show('iFood conectado com sucesso!', 'success');
    }, 2000);
  }

  nextStep() {
    if (this.isStepValid()) {
      this.currentStep.update(v => v + 1);
    }
  }

  prevStep() {
    this.currentStep.update(v => Math.max(0, v - 1));
  }

  isStepValid(): boolean {
    switch (this.currentStep()) {
      case 0: return !!this.data.companyName; // Welcome
      case 1: return true; // Template
      case 2: return true; // Theme
      case 3: return true; // Integrations (optional)
      case 4: return !!this.data.managerName && this.data.managerPin.length === 4; // Manager
      case 5: return true; // Trial Premium
      default: return false;
    }
  }

  // --- FINISH LOGIC ---

  async finish() {
    this.currentStep.set(6); // Show loading screen
    this.isProcessing.set(true);

    try {
        // 1. Company Profile
        this.loadingStatus.set('Configurando perfil da empresa...');
        await this.settingsData.updateCompanyProfile({
            company_name: this.data.companyName,
            cnpj: this.data.cnpj,
            ifood_merchant_id: this.data.ifoodMerchantId || null
        });

        // 2. Roles
        this.loadingStatus.set('Criando cargos e permissões...');
        // Manager role is created by default by DB trigger or we ensure it exists
        // Check/Create other roles
        const rolesToCreate = [];
        if (this.data.hasCashiers) rolesToCreate.push('Caixa');
        if (this.data.hasKitchen) rolesToCreate.push('Cozinha');
        if (this.data.hasWaiters) rolesToCreate.push('Garçom');
        if (this.data.hasDrivers) rolesToCreate.push('Entregador');

        for (const roleName of rolesToCreate) {
             // We use addRole which handles duplication or simple insert
             await this.settingsData.addRole(roleName);
        }

        // 3. Stations
        this.loadingStatus.set('Configurando estações de produção...');
        const stationMap = new Map<string, string>(); // Name -> ID
        for (const stationName of this.data.stations) {
            if (!stationName) continue;
            const { data } = await this.settingsData.addStation(stationName) as any;
            if (data) stationMap.set(stationName, data.id);
        }

        // 4. Hall & Tables
        this.loadingStatus.set('Criando salão e mesas...');
        const { data: hall } = await this.posData.addHall(this.data.hallName) as any;
        if (hall) {
            const tables = Array.from({ length: this.data.tableCount }, (_, i) => ({
                id: `temp-${uuidv4()}`,
                number: i + 1,
                hall_id: hall.id,
                status: 'LIVRE' as const,
                x: 50 + (i % 5) * 100,
                y: 50 + Math.floor(i / 5) * 100,
                width: 80,
                height: 80
            }));
            await this.posData.upsertTables(tables);
        }

        // 5. Menu (Categories, Recipes, Ingredients)
        this.loadingStatus.set('Cadastrando cardápio e estoque...');
        const defaultStationId = stationMap.values().next().value || null; // Fallback
        const userId = this.unitContext.activeUnitId();

        // Cria o Cardápio Híbrido (PDV + Digital)
        const { data: virtualMenu } = await supabase.from('menus').insert({
             name: 'Cardápio Principal',
             type: 'pdv,tablet,delivery,qr',
             is_active: true,
             user_id: userId
        }).select().single();

        let displayOrderCat = 0;
        for (const cat of this.data.menuCategories) {
            if (!cat.name) continue;
            const { data: categoryData } = await this.recipeData.addRecipeCategory(cat.name) as any;
            
            if (categoryData) {
                // Cria a categoria no Menu Digital
                const { data: virtualCat } = await supabase.from('menu_categories').insert({
                     menu_id: virtualMenu?.id,
                     name: cat.name,
                     display_order: displayOrderCat++,
                     user_id: userId
                }).select().single();

                let displayOrderItem = 0;
                for (const item of cat.items) {
                    if (!item.name || !item.price) continue;
                    
                    const { success, proxyRecipeId } = await this.inventoryData.addIngredient({
                        name: item.name,
                        unit: 'un',
                        stock: 100, // Stock Gift
                        min_stock: 10,
                        cost: item.price * 0.3, // Estimated cost
                        is_sellable: true,
                        price: item.price,
                        pos_category_id: categoryData.id,
                        station_id: defaultStationId
                    }) as any;
                    
                    if (success && proxyRecipeId && virtualCat) {
                         await supabase.from('menu_items').insert({
                              menu_category_id: virtualCat.id,
                              recipe_id: proxyRecipeId,
                              custom_name: item.name,
                              is_active: true,
                              display_order: displayOrderItem++,
                              user_id: userId
                         });
                    }
                }
            }
        }

        // 6. Manager Employee
        this.loadingStatus.set('Criando seu acesso administrativo...');
        
        // Find 'Gerente' role or create it
        const { data: roles } = await this.settingsData.getRoles();
        let managerRole = roles.find(r => r.name === 'Gerente');
        
        if (!managerRole) {
            const { data } = await this.settingsData.addRole('Gerente');
            managerRole = data;
        }
        
        let managerDataResult = null;
        if (managerRole) {
            await this.settingsData.grantAllPermissionsToRole(managerRole.id); // Ensure full access
            const { data } = await this.settingsData.addEmployee({
                name: this.data.managerName,
                pin: this.data.managerPin,
                role_id: managerRole.id
            });
            managerDataResult = data;
        }

        // 7. Configurações concluídas
        this.loadingStatus.set('Registrando configurações do sistema...');

        // Success!
        this.loadingStatus.set('Tudo pronto!');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Show success message
        
        const unitId = this.unitContext.activeUnitId();
        if (unitId) {
             await this.supabaseState.loadCoreData(unitId);
             await this.supabaseState.loadEssentialData(unitId);
        }

        // Auto-login the manager so they don't have to type the PIN manually
        if (managerDataResult) {
            this.opAuth.login(managerDataResult as any);
        } else {
             // Fallback just in case
             const { data: managerData } = await supabase
                 .from('employees')
                 .select('*')
                 .eq('pin', this.data.managerPin)
                 .eq('user_id', unitId)
                 .single();
     
             if (managerData) {
                 this.opAuth.login(managerData);
             }
        }
        
        // Start the Guided Tour Demo Mode!
        this.demoMode.startSalesDemoTour();

    } catch (e: any) {
        console.error('Onboarding Error:', e);
        this.notification.show(`Erro na configuração: ${e.message}`, 'error');
        this.currentStep.set(5); // Go back to last editable step
    } finally {
        this.isProcessing.set(false);
    }
  }
}
