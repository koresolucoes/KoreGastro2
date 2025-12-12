// This file contains mock data for the public demo mode.

import { 
    Hall, Table, Station, Employee, Role, RolePermission, Category, Recipe, Order, OrderItem, Ingredient, IngredientCategory, Supplier, Customer, Transaction 
} from '../models/db.models';
import { ALL_PERMISSION_KEYS } from '../config/permissions';

// --- ROLES & EMPLOYEES ---
export const MOCK_ROLES: Role[] = [
    { id: 'role-1', name: 'Gerente', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'role-2', name: 'Caixa', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'role-3', name: 'Garçom', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'role-4', name: 'Cozinha', user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_ROLE_PERMISSIONS: RolePermission[] = [
    // Gerente tem todas as permissões
    ...ALL_PERMISSION_KEYS.map(key => ({ role_id: 'role-1', permission_key: key, user_id: 'demo-user' })),
    // Outros cargos
    { role_id: 'role-2', permission_key: '/pos', user_id: 'demo-user' },
    { role_id: 'role-2', permission_key: '/cashier', user_id: 'demo-user' },
    { role_id: 'role-3', permission_key: '/pos', user_id: 'demo-user' },
    { role_id: 'role-4', permission_key: '/kds', user_id: 'demo-user' },
];

export const MOCK_EMPLOYEES: Employee[] = [
    { id: 'emp-1', name: 'Ana Gerente', pin: '1111', role_id: 'role-1', user_id: 'demo-user', created_at: new Date().toISOString(), current_clock_in_id: null },
    { id: 'emp-2', name: 'Bruno Caixa', pin: '2222', role_id: 'role-2', user_id: 'demo-user', created_at: new Date().toISOString(), current_clock_in_id: null },
    { id: 'emp-3', name: 'Carla Garçonete', pin: '3333', role_id: 'role-3', user_id: 'demo-user', created_at: new Date().toISOString(), current_clock_in_id: null },
    { id: 'emp-4', name: 'Davi Cozinheiro', pin: '4444', role_id: 'role-4', user_id: 'demo-user', created_at: new Date().toISOString(), current_clock_in_id: null },
];


// --- POS & KDS ---
export const MOCK_HALLS: Hall[] = [
    { id: 'hall-1', name: 'Salão Principal', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'hall-2', name: 'Varanda', user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_TABLES: Table[] = [
    // Salão Principal
    { id: 'table-1', number: 1, hall_id: 'hall-1', status: 'LIVRE', x: 50, y: 50, width: 80, height: 80, user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'table-2', number: 2, hall_id: 'hall-1', status: 'OCUPADA', x: 150, y: 50, width: 80, height: 120, customer_count: 4, employee_id: 'emp-3', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'table-3', number: 3, hall_id: 'hall-1', status: 'PAGANDO', x: 250, y: 50, width: 120, height: 80, customer_count: 2, employee_id: 'emp-3', user_id: 'demo-user', created_at: new Date().toISOString() },
    // Varanda
    { id: 'table-4', number: 10, hall_id: 'hall-2', status: 'LIVRE', x: 50, y: 50, width: 80, height: 80, user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_STATIONS: Station[] = [
    { id: 'station-1', name: 'Cozinha', employee_id: 'emp-4', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'station-2', name: 'Bar', employee_id: null, user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_ORDERS: Order[] = [
    {
        // FIX: The `Order` type does not have a `created_at` property. It was removed.
        id: 'order-1', table_number: 2, status: 'OPEN', order_type: 'Dine-in', user_id: 'demo-user', timestamp: new Date(Date.now() - 15 * 60000).toISOString(), customer_id: null, completed_at: null,
        order_items: [
            { id: 'oi-1', order_id: 'order-1', recipe_id: 'recipe-1', name: 'Hambúrguer Clássico', quantity: 2, price: 30, original_price: 30, status: 'EM_PREPARO', station_id: 'station-1', notes: 'Um sem picles', group_id: null, status_timestamps: {'PENDENTE': new Date(Date.now() - 14 * 60000).toISOString(), 'EM_PREPARO': new Date(Date.now() - 5 * 60000).toISOString() }, user_id: 'demo-user', created_at: new Date(Date.now() - 14 * 60000).toISOString(), discount_type: null, discount_value: null },
            { id: 'oi-2', order_id: 'order-1', recipe_id: 'recipe-4', name: 'Refrigerante', quantity: 2, price: 8, original_price: 8, status: 'PRONTO', station_id: 'station-2', notes: null, group_id: null, status_timestamps: {'PENDENTE': new Date(Date.now() - 14 * 60000).toISOString(), 'PRONTO': new Date(Date.now() - 12 * 60000).toISOString() }, user_id: 'demo-user', created_at: new Date(Date.now() - 14 * 60000).toISOString(), discount_type: null, discount_value: null },
        ]
    },
    {
        // FIX: The `Order` type does not have a `created_at` property. It was removed.
        id: 'order-2', table_number: 3, status: 'OPEN', order_type: 'Dine-in', user_id: 'demo-user', timestamp: new Date(Date.now() - 30 * 60000).toISOString(), customer_id: null, completed_at: null,
        order_items: [
             { id: 'oi-3', order_id: 'order-2', recipe_id: 'recipe-2', name: 'Pizza Margherita', quantity: 1, price: 50, original_price: 50, status: 'SERVIDO', station_id: 'station-1', notes: null, group_id: null, status_timestamps: {}, user_id: 'demo-user', created_at: new Date().toISOString(), discount_type: null, discount_value: null }
        ]
    }
];

// --- INVENTORY & RECIPES ---
export const MOCK_INGREDIENT_CATEGORIES: IngredientCategory[] = [
    { id: 'ing-cat-1', name: 'Carnes', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'ing-cat-2', name: 'Hortifruti', user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_SUPPLIERS: Supplier[] = [
    { id: 'sup-1', name: 'Açougue do Zé', user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_INGREDIENTS: Ingredient[] = [
    { id: 'ing-1', name: 'Carne de Hambúrguer', unit: 'g', stock: 2000, cost: 0.05, min_stock: 1000, category_id: 'ing-cat-1', supplier_id: 'sup-1', expiration_date: null, is_sellable: false, price: null, pos_category_id: null, station_id: null, proxy_recipe_id: null, external_code: null, user_id: 'demo-user', created_at: new Date().toISOString(), is_portionable: false, is_yield_product: false, standard_portion_weight_g: null },
    { id: 'ing-2', name: 'Pão de Hambúrguer', unit: 'un', stock: 50, cost: 1, min_stock: 20, category_id: null, supplier_id: null, expiration_date: null, is_sellable: false, price: null, pos_category_id: null, station_id: null, proxy_recipe_id: null, external_code: null, user_id: 'demo-user', created_at: new Date().toISOString(), is_portionable: false, is_yield_product: false, standard_portion_weight_g: null },
    { id: 'ing-3', name: 'Queijo Cheddar', unit: 'g', stock: 1000, cost: 0.04, min_stock: 500, category_id: null, supplier_id: null, expiration_date: null, is_sellable: false, price: null, pos_category_id: null, station_id: null, proxy_recipe_id: null, external_code: null, user_id: 'demo-user', created_at: new Date().toISOString(), is_portionable: false, is_yield_product: false, standard_portion_weight_g: null },
    { id: 'ing-4', name: 'Tomate', unit: 'g', stock: 500, cost: 0.01, min_stock: 200, category_id: 'ing-cat-2', supplier_id: null, expiration_date: null, is_sellable: false, price: null, pos_category_id: null, station_id: null, proxy_recipe_id: null, external_code: null, user_id: 'demo-user', created_at: new Date().toISOString(), is_portionable: false, is_yield_product: false, standard_portion_weight_g: null },
    { id: 'ing-5', name: 'Massa de Pizza', unit: 'g', stock: 1500, cost: 0.02, min_stock: 500, category_id: null, supplier_id: null, expiration_date: null, is_sellable: false, price: null, pos_category_id: null, station_id: null, proxy_recipe_id: null, external_code: null, user_id: 'demo-user', created_at: new Date().toISOString(), is_portionable: false, is_yield_product: false, standard_portion_weight_g: null },
    { id: 'ing-6', name: 'Lata de Refrigerante', unit: 'un', stock: 100, cost: 3, min_stock: 30, category_id: null, supplier_id: null, expiration_date: null, is_sellable: true, price: 8, pos_category_id: 'cat-2', station_id: 'station-2', proxy_recipe_id: 'recipe-4', external_code: 'REFRI-LATA', user_id: 'demo-user', created_at: new Date().toISOString(), is_portionable: false, is_yield_product: false, standard_portion_weight_g: null },
];

export const MOCK_RECIPE_CATEGORIES: Category[] = [
    { id: 'cat-1', name: 'Lanches', image_url: null, user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'cat-2', name: 'Bebidas', image_url: null, user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_RECIPES: Recipe[] = [
    // FIX: Add missing image_url property to conform to Recipe type.
    { id: 'recipe-1', name: 'Hambúrguer Clássico', price: 30, category_id: 'cat-1', prep_time_in_minutes: 10, is_available: true, is_sub_recipe: false, source_ingredient_id: null, external_code: 'HB-CLASSICO', user_id: 'demo-user', created_at: new Date().toISOString(), image_url: null },
    // FIX: Add missing image_url property to conform to Recipe type.
    { id: 'recipe-2', name: 'Pizza Margherita', price: 50, category_id: 'cat-1', prep_time_in_minutes: 15, is_available: true, is_sub_recipe: false, source_ingredient_id: null, external_code: 'PZ-MARGH', user_id: 'demo-user', created_at: new Date().toISOString(), image_url: null },
    // FIX: Add missing image_url property to conform to Recipe type.
    { id: 'recipe-3', name: 'Batata Frita', price: 15, category_id: 'cat-1', prep_time_in_minutes: 8, is_available: true, is_sub_recipe: false, source_ingredient_id: null, external_code: 'BATATA-FRITA', user_id: 'demo-user', created_at: new Date().toISOString(), image_url: null },
    // FIX: Add missing image_url property to conform to Recipe type.
    { id: 'recipe-4', name: 'Refrigerante', price: 8, category_id: 'cat-2', prep_time_in_minutes: 1, is_available: true, is_sub_recipe: false, source_ingredient_id: 'ing-6', external_code: 'REFRI-LATA', user_id: 'demo-user', created_at: new Date().toISOString(), image_url: null },
];

// --- OTHERS ---
export const MOCK_CUSTOMERS: Customer[] = [
    { id: 'cust-1', name: 'Cliente Fiel', phone: '11999998888', email: 'fiel@email.com', cpf: '123.456.789-00', address: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200', latitude: -23.5613, longitude: -46.6565, notes: 'Prefere a mesa da janela.', loyalty_points: 150, user_id: 'demo-user', created_at: new Date().toISOString() },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
    { id: 'trans-1', date: new Date(Date.now() - 2 * 60 * 60000).toISOString(), description: 'Abertura de Caixa', type: 'Abertura de Caixa', amount: 200, employee_id: 'emp-2', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'trans-2', date: new Date(Date.now() - 1 * 60 * 60000).toISOString(), description: 'Receita Pedido #order-X (PIX)', type: 'Receita', amount: 85, employee_id: 'emp-2', user_id: 'demo-user', created_at: new Date().toISOString() },
    { id: 'trans-3', date: new Date(Date.now() - 1 * 30 * 60000).toISOString(), description: 'Compra de gelo', type: 'Despesa', amount: 15, employee_id: 'emp-2', user_id: 'demo-user', created_at: new Date().toISOString() },
];