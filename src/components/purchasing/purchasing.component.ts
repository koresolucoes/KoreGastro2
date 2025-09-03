import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PurchaseOrder, PurchaseOrderStatus, Supplier, Ingredient, PurchaseOrderItem } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { PurchasingDataService } from '../../services/purchasing-data.service';

type FormItem = {
    id: string;
    ingredient_id: string;
    quantity: number;
    cost: number;
    name: string;
    unit: string;
};

@Component({
  selector: 'app-purchasing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './purchasing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasingComponent implements OnInit {
    stateService = inject(SupabaseStateService);
    purchasingDataService = inject(PurchasingDataService);
    router = inject(Router);

    purchaseOrders = this.stateService.purchaseOrders;
    suppliers = this.stateService.suppliers;
    ingredients = this.stateService.ingredients;

    isModalOpen = signal(false);
    editingOrder = signal<Partial<PurchaseOrder> | null>(null);
    orderForm = signal<{ supplier_id: string | null, status: PurchaseOrderStatus, notes: string }>({ supplier_id: null, status: 'Rascunho', notes: '' });
    orderItems = signal<FormItem[]>([]);
    itemSearchTerm = signal('');
    
    orderPendingDeletion = signal<PurchaseOrder | null>(null);

    updateOrderFormField(field: 'supplier_id' | 'status' | 'notes', value: string) {
        this.orderForm.update(f => ({
            ...f,
            [field]: field === 'supplier_id' ? (value === 'null' ? null : value) : value
        }));
    }

    ngOnInit() {
        const navigationState = this.router.getCurrentNavigation()?.extras.state;
        if (navigationState && navigationState['newOrderItems']) {
            this.openAddModal(navigationState['newOrderItems']);
        }
    }

    filteredIngredients = computed(() => {
        const term = this.itemSearchTerm().toLowerCase();
        if (!term) return [];
        const currentItemIds = new Set(this.orderItems().map(i => i.ingredient_id));
        return this.ingredients()
            .filter(i => !currentItemIds.has(i.id) && i.name.toLowerCase().includes(term))
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
        }));
        this.orderItems.set(items);
        this.isModalOpen.set(true);
    }
    
    closeModal() {
        this.isModalOpen.set(false);
    }
    
    addItemToOrder(ingredient: Ingredient) {
        this.orderItems.update(items => [...items, {
            id: `temp-${ingredient.id}`,
            ingredient_id: ingredient.id,
            quantity: 1,
            cost: ingredient.cost,
            name: ingredient.name,
            unit: ingredient.unit,
        }]);
        this.itemSearchTerm.set('');
    }

    updateItemField(itemId: string, field: 'quantity' | 'cost', value: number) {
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
            alert('Adicione pelo menos um item à ordem de compra.');
            return;
        }

        const result = this.editingOrder()?.id
            ? await this.purchasingDataService.updatePurchaseOrder(this.editingOrder()!.id!, formValue, items)
            : await this.purchasingDataService.createPurchaseOrder(formValue, items);

        if (result.success) this.closeModal();
        else alert(`Falha ao salvar. Erro: ${result.error?.message}`);
    }

    async markAsReceived(order: PurchaseOrder) {
        if (!confirm(`Tem certeza que deseja marcar o pedido #${order.id.slice(0, 8)} como recebido? Esta ação atualizará seu estoque.`)) {
            return;
        }
        const result = await this.purchasingDataService.receivePurchaseOrder(order);
        if (!result.success) {
            alert(`Falha ao receber pedido. Erro: ${result.error?.message}`);
        }
    }
    
    requestDeleteOrder(order: PurchaseOrder) { this.orderPendingDeletion.set(order); }
    cancelDeleteOrder() { this.orderPendingDeletion.set(null); }
    
    async confirmDeleteOrder() {
        const order = this.orderPendingDeletion();
        if (order) {
            const result = await this.purchasingDataService.deletePurchaseOrder(order.id);
            if (!result.success) alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            this.orderPendingDeletion.set(null);
        }
    }
}