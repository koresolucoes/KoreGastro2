
import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsDataService } from '../../services/settings-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { NotificationService } from '../../services/notification.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { v4 as uuidv4 } from 'uuid';

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
  private settingsData = inject(SettingsDataService);
  private recipeData = inject(RecipeDataService);
  private posData = inject(PosDataService);
  private inventoryData = inject(InventoryDataService);
  private notification = inject(NotificationService);

  currentStep = signal(0);
  isProcessing = signal(false);
  loadingStatus = signal('Iniciando...');
  
  selectedCategoryIndex = signal(0);

  // Form Data Complex Object
  data = {
    // Step 1: Company
    companyName: '',
    cnpj: '',
    
    // Step 2: Roles
    hasWaiters: true,
    hasKitchen: true,
    hasDrivers: false,
    hasCashiers: true,

    // Step 3: Hall
    hallName: 'Salão Principal',
    tableCount: 10,

    // Step 4: Stations
    stations: ['Cozinha'] as string[],

    // Step 5: Menu
    menuCategories: [
        { name: 'Lanches', items: [{ name: 'X-Burguer', price: 25.00 }] },
        { name: 'Bebidas', items: [{ name: 'Refrigerante', price: 6.00 }] }
    ] as MenuCategory[],

    // Step 6: iFood
    ifoodMerchantId: '',

    // Step 7: Manager
    managerName: '',
    managerPin: ''
  };

  steps = [
    { id: 'welcome', title: 'Boas-vindas' },
    { id: 'company', title: 'Empresa' },
    { id: 'roles', title: 'Equipe' },
    { id: 'hall', title: 'Ambiente' },
    { id: 'stations', title: 'Produção' },
    { id: 'menu', title: 'Cardápio' },
    { id: 'ifood', title: 'iFood' },
    { id: 'manager', title: 'Acesso' },
    { id: 'finish', title: 'Conclusão' }
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
      case 2: return true; // Checkboxes always valid
      case 3: return !!this.data.hallName && this.data.tableCount > 0;
      case 4: return this.data.stations.length > 0 && this.data.stations.every(s => !!s);
      case 5: return this.data.menuCategories.length > 0; // Basic check
      case 6: return true; // Optional
      case 7: return !!this.data.managerName && this.data.managerPin.length === 4;
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
    this.currentStep.set(8); // Show loading screen
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

        for (const cat of this.data.menuCategories) {
            if (!cat.name) continue;
            const { data: categoryData } = await this.recipeData.addRecipeCategory(cat.name) as any;
            
            if (categoryData) {
                for (const item of cat.items) {
                    if (!item.name || !item.price) continue;
                    
                    // Create Ingredient (implicitly creates Recipe via backend logic/proxy if we wanted, but let's do explicit for control)
                    // Actually, simpler flow: Create Ingredient with is_sellable=true
                    
                    // Try to match station by name (simple heuristic) or use default
                    // Ex: if category is "Bebidas" and there is a "Bar" station, use it. 
                    // For now, use defaultStationId for simplicity.
                    
                    await this.inventoryData.addIngredient({
                        name: item.name,
                        unit: 'un',
                        stock: 100, // Stock Gift
                        min_stock: 10,
                        cost: item.price * 0.3, // Estimated cost
                        is_sellable: true,
                        price: item.price,
                        pos_category_id: categoryData.id,
                        station_id: defaultStationId
                    });
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
        
        if (managerRole) {
            await this.settingsData.grantAllPermissionsToRole(managerRole.id); // Ensure full access
            await this.settingsData.addEmployee({
                name: this.data.managerName,
                pin: this.data.managerPin,
                role_id: managerRole.id
            });
        }

        // Success!
        this.loadingStatus.set('Tudo pronto!');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Show success message
        
        this.router.navigate(['/employee-selection']);

    } catch (e: any) {
        console.error('Onboarding Error:', e);
        this.notification.show(`Erro na configuração: ${e.message}`, 'error');
        this.currentStep.set(7); // Go back to last editable step
    } finally {
        this.isProcessing.set(false);
    }
  }
}
