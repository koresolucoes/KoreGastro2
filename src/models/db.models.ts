export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'un';
export type TableStatus = 'LIVRE' | 'OCUPADA' | 'PAGANDO';
export type OrderItemStatus = 'AGUARDANDO' | 'PENDENTE' | 'EM_PREPARO' | 'PRONTO';
export type OrderType = 'Dine-in' | 'Takeout' | 'QuickSale';
export type TransactionType = 'Receita' | 'Despesa' | 'Gorjeta';

export interface Ingredient {
    id: string;
    name: string;
    unit: IngredientUnit;
    stock: number;
    cost: number;
    min_stock: number;
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
}

export interface Recipe {
    id: string;
    name: string;
    description?: string;
    price: number;
    category_id: string;
    prep_time_in_minutes?: number;
    station_id: string;
    is_available: boolean;
    created_at: string;
}

export interface RecipeIngredient {
    recipe_id: string;
    ingredient_id: string;
    quantity: number;
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
