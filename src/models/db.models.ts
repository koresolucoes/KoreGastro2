
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'un';
export type TableStatus = 'LIVRE' | 'OCUPADA' | 'PAGANDO';
export type OrderItemStatus = 'AGUARDANDO' | 'PENDENTE' | 'EM_PREPARO' | 'PRONTO';
export type OrderType = 'Dine-in' | 'Takeout' | 'QuickSale';
export type TransactionType = 'Receita' | 'Despesa' | 'Gorjeta' | 'Abertura de Caixa';

export interface IngredientCategory {
    id: string;
    name: string;
    created_at: string;
}

export interface Supplier {
    id: string;
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    created_at: string;
}

export interface Ingredient {
    id: string;
    name: string;
    unit: IngredientUnit;
    stock: number;
    cost: number;
    min_stock: number;
    created_at: string;
    category_id: string | null;
    supplier_id: string | null;
    expiration_date?: string | null;
    last_movement_at?: string | null;
    ingredient_categories?: { name: string } | null; // For joined data
    suppliers?: { name: string } | null; // For joined data
}

export interface InventoryMovement {
    id: string;
    ingredient_id: string;
    quantity_change: number;
    reason: string;
    created_at: string;
}

export interface Category {
    id: string;
    name: string;
    created_at: string;
}

export interface Station {
    id: string;
    name: string;
    created_at: string;
    auto_print_orders: boolean;
    printer_name?: string | null;
}

export interface RecipePreparation {
    id:string;
    recipe_id: string;
    station_id: string;
    name: string;
    prep_instructions?: string | null;
    display_order: number;
    created_at: string;
    // For UI
    station_name?: string;
    recipe_ingredients?: RecipeIngredient[];
}

export interface Recipe {
    id: string;
    name: string;
    description?: string;
    price: number;
    category_id: string;
    prep_time_in_minutes?: number;
    operational_cost?: number | null;
    is_available: boolean;
    created_at: string;
    hasStock?: boolean;
}

export interface RecipeIngredient {
    recipe_id: string;
    ingredient_id: string;
    quantity: number;
    preparation_id: string;
    // Joined data for UI
    ingredients?: Pick<Ingredient, 'name' | 'unit' | 'cost'>;
}

export interface Employee {
    id: string;
    name: string;
    role?: string;
    pin?: string;
    created_at: string;
}

export interface Hall {
    id: string;
    name: string;
    created_at: string;
}

export interface Table {
    id: string;
    number: number;
    hall_id: string;
    status: TableStatus;
    x: number;
    y: number;
    width: number;
    height: number;
    employee_id?: string;
    customer_count?: number;
    created_at: string;
}

export interface Order {
    id: string;
    table_number: number;
    timestamp: string;
    order_type: OrderType;
    customer_name?: string;
    customer_count?: number;
    is_completed: boolean;
    completed_at?: string;
    order_items: OrderItem[];
}

export interface OrderItem {
    id: string;
    order_id: string;
    recipe_id: string;
    name: string;
    quantity: number;
    notes?: string;
    status: OrderItemStatus;
    station_id: string;
    course?: number;
    status_timestamps?: any;
    created_at: string;
    price: number;
    group_id?: string | null;
}

export interface Customer {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    visits: number;
    created_at: string;
}

export interface Transaction {
    id: string;
    description: string;
    type: TransactionType;
    amount: number;
    date: string;
}

export interface CashierClosing {
    id: string;
    closed_at: string;
    opening_balance: number;
    total_revenue: number;
    total_expenses: number;
    expected_cash_in_drawer: number;
    counted_cash: number;
    difference: number;
    payment_summary: any; // JSONB
    notes?: string | null;
    closed_by_employee_id?: string | null;
}
