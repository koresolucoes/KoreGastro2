
import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
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

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
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

  currentStep = signal(0);
  isProcessing = signal(false);
  loadingStatus = signal('Iniciando...');
  
  selectedCategoryIndex = signal(0);

  // Form Data Complex Object
  data = {
    // Step 1: Company
    companyName: '',
    cnpj: '',
    
    // Step 2: Roles (Simplified to core operations)
    hasWaiters: true,
    hasKitchen: true,
    hasDrivers: false,

    // Step 3: Menu Core Structure
    menuCategories: [
        { name: 'Lanches', items: [{ name: 'X-Burguer', price: 25.00 }] },
        { name: 'Bebidas', items: [{ name: 'Refrigerante', price: 6.00 }] }
    ] as MenuCategory[],

    // Step 4: Manager setup
    managerName: '',
    managerPin: ''
  };

  steps = [
    { id: 'welcome', title: 'Boas-vindas' },
    { id: 'company', title: 'Empresa' },
    { id: 'roles', title: 'Operação' },
    { id: 'menu', title: 'Cardápio Inicial' },
    { id: 'manager', title: 'Seu Acesso' },
    { id: 'finish', title: 'Configurando' }
  ];

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
      case 0: return true;
      case 1: return !!this.data.companyName;
      case 2: return true; 
      case 3: return this.data.menuCategories.length > 0;
      case 4: return !!this.data.managerName && this.data.managerPin.length === 4;
      default: return false;
    }
  }

  // --- Helper Methods for UI ---

  addStation() {
      this.data.stations.push('');
  }

  removeStation(index: number) {
      this.data.stations.splice(index, 1);
  }

  addCategory() {
      this.data.menuCategories.push({ name: 'Nova Categoria', items: [] });
      this.selectedCategoryIndex.set(this.data.menuCategories.length - 1);
  }

  selectCategory(index: number) {
      this.selectedCategoryIndex.set(index);
  }

  addItemToCategory(catIndex: number) {
      this.data.menuCategories[catIndex].items.push({ name: '', price: null });
  }

  removeItem(catIndex: number, itemIndex: number) {
      this.data.menuCategories[catIndex].items.splice(itemIndex, 1);
  }

  // --- FINISH LOGIC ---

  async finish() {
    this.currentStep.set(5); // Show loading screen
    this.isProcessing.set(true);

    try {
        // 1. Company Profile
        this.loadingStatus.set('Configurando perfil da empresa...');
        await this.settingsData.updateCompanyProfile({
            company_name: this.data.companyName,
            cnpj: this.data.cnpj,
        });

        // 2. Roles
        this.loadingStatus.set('Criando cargos e permissões...');
        const rolesToCreate = ['Caixa']; // Always create Caixa
        if (this.data.hasKitchen) rolesToCreate.push('Cozinha');
        if (this.data.hasWaiters) rolesToCreate.push('Garçom');
        if (this.data.hasDrivers) rolesToCreate.push('Entregador');

        for (const roleName of rolesToCreate) {
             await this.settingsData.addRole(roleName);
        }

        // 3. Defaults: Stations & Hall
        this.loadingStatus.set('Configurando ambiente padrão...');
        const { data: station } = await this.settingsData.addStation('Cozinha') as any;
        const defaultStationId = station?.id || null;

        const { data: hall } = await this.posData.addHall('Salão Principal') as any;
        if (hall) {
            const tables = Array.from({ length: 12 }, (_, i) => ({
                id: `temp-${uuidv4()}`,
                number: i + 1,
                hall_id: hall.id,
                status: 'LIVRE' as const,
                x: 50 + (i % 4) * 100,
                y: 50 + Math.floor(i / 4) * 100,
                width: 80,
                height: 80
            }));
            await this.posData.upsertTables(tables);
        }

        // 4. Menu (Categories, Recipes, Ingredients)
        this.loadingStatus.set('Cadastrando cardápio inicial...');
        const userId = this.unitContext.activeUnitId();

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
                        stock: 100, 
                        min_stock: 10,
                        cost: item.price * 0.3,
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

        // 5. Manager Employee
        this.loadingStatus.set('Criando seu acesso administrativo...');
        
        const { data: roles } = await this.settingsData.getRoles();
        let managerRole = roles.find(r => r.name === 'Gerente');
        
        if (!managerRole) {
            const { data } = await this.settingsData.addRole('Gerente');
            managerRole = data;
        }
        
        let managerDataResult = null;
        if (managerRole) {
            await this.settingsData.grantAllPermissionsToRole(managerRole.id);
            const { data } = await this.settingsData.addEmployee({
                name: this.data.managerName,
                pin: this.data.managerPin,
                role_id: managerRole.id
            });
            managerDataResult = data;
        }

        this.loadingStatus.set('Registrando configurações do sistema...');
        this.loadingStatus.set('Tudo pronto!');
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        
        const unitId = this.unitContext.activeUnitId();
        if (unitId) {
             await this.supabaseState.loadCoreData(unitId);
             await this.supabaseState.loadEssentialData(unitId);
        }

        if (managerDataResult) {
            this.opAuth.login(managerDataResult as any);
        } else {
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
        
        this.demoMode.startSalesDemoTour();

    } catch (e: any) {
        console.error('Onboarding Error:', e);
        this.notification.show(`Erro na configuração: ${e.message}`, 'error');
        this.currentStep.set(4); 
    } finally {
        this.isProcessing.set(false);
    }
  }
}
