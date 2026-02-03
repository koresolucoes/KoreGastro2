
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PurchaseOrder, PurchaseOrderStatus, Supplier, Ingredient, PurchaseOrderItem, IngredientUnit } from '../../models/db.models';
import { InventoryStateService } from '../../services/inventory-state.service';
import { PurchasingDataService } from '../../services/purchasing-data.service';
import { NotificationService } from '../../services/notification.service';
import { v4 as uuidv4 } from 'uuid';
import { InventoryDataService } from '../../services/inventory-data.service';
import { FormsModule } from '@angular/forms';

type FormItem = {
    id: string; // Can be temp id
    ingredient_id: string;
    quantity: number;
    cost: number;
    name: string;
    unit: string;
    lot_number: string | null;
    expiration_date: string | null;
};

type PurchaseOrderFormState = {
    supplier_id: string | null;
    status: PurchaseOrderStatus;
    notes: string;
};

@Component({
  selector: 'app-purchasing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './purchasing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasingComponent implements OnInit {
    inventoryState = inject(InventoryStateService);
    purchasingDataService = inject(PurchasingDataService);
    router: Router = inject(Router);
    notificationService = inject(NotificationService);
    inventoryDataService = inject(InventoryDataService);

    purchaseOrders = this.inventoryState.purchaseOrders;
    suppliers = this.inventoryState.suppliers;
    ingredients = this.inventoryState.ingredients;

    isModalOpen = signal(false);
    editingOrder = signal<Partial<PurchaseOrder> | null>(null);
    orderForm = signal<PurchaseOrderFormState>({ supplier_id: null, status: 'Rascunho', notes: '' });
    orderItems = signal<FormItem[]>([]);
    itemSearchTerm = signal('');
    
    orderPendingDeletion = signal<PurchaseOrder | null>(null);

    // New signals for on-the-fly ingredient creation
    isAddingIngredient = signal(false);
    newIngredientForm = signal<Partial<Ingredient>>({});
    availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];

    // For visual feedback
    currentItemIds = computed(() => new Set(this.orderItems().map(i => i.ingredient_id)));

    purchaseOrdersWithDetails = computed(() => {
        return this.purchaseOrders().map(order => ({
            ...order,
            total: order.purchase_order_items?.reduce((sum, item) => sum + (item.quantity * item.cost), 0) ?? 0,
            itemCount: order.purchase_order_items?.length ?? 0
        }));
    });

    updatePOFormField(field: 'supplier_id' | 'status' | 'notes', value: string) {
        this.orderForm.update((form: PurchaseOrderFormState) => {
            const updated = { ...form };
            if (field === 'supplier_id') {
                updated.supplier_id = value === 'null' ? null : value;
            } else if (field === 'status') {
                updated.status = value as PurchaseOrderStatus;
            } else if (field === 'notes') {
                updated.notes = value;
            }
            return updated;
        });
    }

    ngOnInit() {
        const navigationState = this.router.getCurrentNavigation()?.extras.state as any; // Cast to any to allow access
        if (navigationState && navigationState['newOrderItems']) {
            const prefillItems = navigationState['newOrderItems'] as { ingredientId: string, quantity: number }[];
            // FIX: Explicitly type the Map to ensure correct type inference
            const ingredientsMap = new Map<string, Ingredient>(
                this.ingredients().map(i => [i.id, i])
            );
            
            const suppliersInOrder = new Map<string | null, { ingredientId: string, quantity: number }[]>();
            
            prefillItems.forEach(item => {
                const ingredient = ingredientsMap.get(item.ingredientId);
                // FIX: Ensure ingredient is defined before accessing properties
                const supplierId = ingredient?.supplier_id || null;
                
                if (!suppliersInOrder.has(supplierId)) {
                    suppliersInOrder.set(supplierId, []);
                }
                suppliersInOrder.get(supplierId)!.push(item);
            });
            
            if (suppliersInOrder.size > 0) {
                const firstSupplierId = suppliersInOrder.keys().next().value;
                const itemsForThisOrder = suppliersInOrder.get(firstSupplierId);
    
                this.openAddModal(itemsForThisOrder);
                // Explicitly type form to avoid inference issues with unknown
                this.orderForm.update((form: PurchaseOrderFormState) => ({ ...form, supplier_id: firstSupplierId }));
            }
        }
    }

    filteredIngredients = computed(() => {
        const term = this.itemSearchTerm().toLowerCase();
        if (!term) return [];
        return this.ingredients()
            .filter(i => i.name.toLowerCase().includes(term))
            .slice(0, 5);
    });

    orderTotal = computed(() => this.orderItems().reduce((sum, item) => sum + (item.quantity * item.cost), 0));

    getSupplierName(supplierId: string | null): string {
        if (!supplierId) return 'N/A';
        return this.suppliers().find(s => s.id === supplierId)?.name || 'Desconhecido';
    }

    getStatusClass(status: PurchaseOrderStatus): string {
        switch (status) {
            case 'Rascunho': return 'bg-gray-600 text-gray-200';
            case 'Enviada': return 'bg-blue-600 text-white';
            case 'Recebida': return 'bg-green-600 text-white';
        }
    }
    
    openAddModal(prefillItems?: { ingredientId: string, quantity: number }[]) {
        this.editingOrder.set(null);
        this.orderForm.set({ supplier_id: this.suppliers()[0]?.id || null, status: 'Rascunho', notes: '' });
        
        if (prefillItems) {
            const items = prefillItems.map(item => {
                const ingredient = this.ingredients().find(i => i.id === item.ingredientId);
                return ingredient ? {
                    id: `temp-${ingredient.id}`,
                    ingredient_id: ingredient.id,
                    quantity: item.quantity,
                    cost: ingredient.cost,
                    name: ingredient.name,
                    unit: ingredient.unit,
                    lot_number: null,
                    expiration_date: null,
                } : null;
            }).filter(i => i !== null) as FormItem[];
            this.orderItems.set(items);
        } else {
            this.orderItems.set([]);
        }
        
        this.isModalOpen.set(true);
    }

    openEditModal(order: PurchaseOrder) {
        this.editingOrder.set(order);
        this.orderForm.set({ supplier_id: order.supplier_id, status: order.status, notes: order.notes || '' });
        const items = (order.purchase_order_items || []).map(item => ({
            id: item.id,
            ingredient_id: item.ingredient_id,
            quantity: item.quantity,
            cost: item.cost,
            name: item.ingredients?.name || '?',
            unit: item.ingredients?.unit || '?',
            lot_number: item.lot_number,
            expiration_date: item.expiration_date,
        }));
        this.orderItems.set(items);
        this.isModalOpen.set(true);
    }
    
    closeModal() {
        this.isModalOpen.set(false);
    }
    
    async addItemToOrder(ingredient: Ingredient) {
        this.orderItems.update(items => [...items, {
            id: `temp-${ingredient.id}`,
            ingredient_id: ingredient.id,
            quantity: 1,
            cost: ingredient.cost,
            name: ingredient.name,
            unit: ingredient.unit,
            lot_number: null,
            expiration_date: null,
        }]);
        this.itemSearchTerm.set('');

        const currentSupplierId = this.orderForm().supplier_id;
        if (!currentSupplierId && ingredient.supplier_id) {
            const supplierName = this.suppliers().find(s => s.id === ingredient.supplier_id)?.name;
            if (supplierName) {
                const confirmed = await this.notificationService.confirm(
                    `Este item é fornecido por "${supplierName}". Deseja definir este fornecedor para a ordem inteira?`,
                    'Sugerir Fornecedor'
                );
                if (confirmed) {
                    this.updatePOFormField('supplier_id', ingredient.supplier_id!);
                }
            }
        }
    }

    updateItemField(itemId: string, field: 'quantity' | 'cost' | 'lot_number' | 'expiration_date', value: any) {
        this.orderItems.update(items => items.map(item => 
            item.id === itemId ? { ...item, [field]: value } : item
        ));
    }
    
    removeItem(itemId: string) {
        this.orderItems.update(items => items.filter(item => item.id !== itemId));
    }

    async saveOrder() {
        const formValue = this.orderForm();
        const items = this.orderItems();
        if (items.length === 0) {
            await this.notificationService.alert('Adicione pelo menos um item à ordem de compra.');
            return;
        }

        const result = this.editingOrder()?.id
            ? await this.purchasingDataService.updatePurchaseOrder(this.editingOrder()!.id!, formValue, items)
            : await this.purchasingDataService.createPurchaseOrder(formValue, items);

        if (result.success) this.closeModal();
        else await this.notificationService.alert(`Falha ao salvar. Erro: ${result.error?.message}`);
    }

    async markAsReceived(order: PurchaseOrder) {
        const items = order.purchase_order_items || [];
        if (items.some(item => !item.cost || item.cost <= 0)) {
            await this.notificationService.alert('Atenção: Preencha o custo de todos os itens antes de receber o pedido. Edite o pedido para adicionar os custos.');
            return;
        }

        const itemsWithoutExpiration = items.filter(item => !item.expiration_date);
        if (itemsWithoutExpiration.length > 0) {
            const confirmedNoExp = await this.notificationService.confirm(
                `${itemsWithoutExpiration.length} item(ns) estão sem data de validade. Deseja recebê-los mesmo assim? (Não recomendado)`,
                'Aviso de Validade'
            );
            if (!confirmedNoExp) return;
        }

        const confirmed = await this.notificationService.confirm(`Tem certeza que deseja marcar o pedido #${order.id.slice(0, 8)} como recebido? Esta ação atualizará seu estoque.`, 'Confirmar Recebimento');
        if (!confirmed) {
            return;
        }
        const result = await this.purchasingDataService.receivePurchaseOrder(order);
        if (!result.success) {
            await this.notificationService.alert(`Falha ao receber pedido. Erro: ${result.error?.message}`);
        }
    }
    
    requestDeleteOrder(order: PurchaseOrder) { this.orderPendingDeletion.set(order); }
    cancelDeleteOrder() { this.orderPendingDeletion.set(null); }
    
    async confirmDeleteOrder() {
        const order = this.orderPendingDeletion();
        if (order) {
            const result = await this.purchasingDataService.deletePurchaseOrder(order.id);
            if (!result.success) await this.notificationService.alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            this.orderPendingDeletion.set(null);
        }
    }
    
    // --- On-the-fly Ingredient Creation ---
    openAddIngredientModal() {
        this.itemSearchTerm.set(''); // Close search popover
        this.newIngredientForm.set({ name: '', unit: 'un', cost: 0, stock: 0, min_stock: 0 });
        this.isAddingIngredient.set(true);
    }
    
    closeAddIngredientModal() {
        this.isAddingIngredient.set(false);
    }

    // FIX: Replaced unsafe object update with a type-safe switch statement to handle different field types correctly.
    updateNewIngredientField(field: keyof Omit<Ingredient, 'id' | 'created_at' | 'user_id' | 'ingredient_categories' | 'suppliers'>, value: any) {
        this.newIngredientForm.update(form => {
            const newForm: Partial<Ingredient> = { ...form };
            
            switch (field) {
                case 'stock':
                case 'cost':
                case 'min_stock':
                case 'standard_portion_weight_g': {
                    const numValue = parseFloat(value);
                    (newForm as any)[field] = isNaN(numValue) ? (field === 'standard_portion_weight_g' ? null : 0) : numValue;
                    break;
                }
                case 'price': {
                    const numValue = parseFloat(value);
                    newForm.price = isNaN(numValue) ? null : numValue;
                    break;
                }
                case 'is_sellable':
                case 'is_portionable':
                case 'is_yield_product':
                    (newForm as any)[field] = value as boolean;
                    break;
                case 'name':
                    newForm.name = value;
                    break;
                case 'unit':
                    newForm.unit = value as IngredientUnit;
                    break;
                case 'category_id':
                case 'supplier_id':
                case 'pos_category_id':
                case 'station_id':
                case 'proxy_recipe_id':
                case 'external_code':
                case 'expiration_date':
                case 'last_movement_at':
                    (newForm as any)[field] = (value === 'null' || value === '') ? null : value;
                    break;
                default: {
                    const _exhaustiveCheck: never = field;
                    break;
                }
            }

            return newForm;
        });
    }

    async saveNewIngredient() {
        const form = this.newIngredientForm();
        if (!form.name?.trim()) {
            await this.notificationService.alert('O nome do ingrediente é obrigatório.');
            return;
        }
        const { success, error, data: newIngredient } = await this.inventoryDataService.addIngredient(form);
        if (success && newIngredient) {
            await this.addItemToOrder(newIngredient as Ingredient);
            this.closeAddIngredientModal();
        } else {
            await this.notificationService.alert(`Erro: ${error?.message}`);
        }
    }
}
