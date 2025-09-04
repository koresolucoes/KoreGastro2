// --- Basic Types ---
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'un';
export type TableStatus = 'LIVRE' | 'OCUPADA' | 'PAGANDO';
export type OrderItemStatus = 'PENDENTE' | 'EM_PREPARO' | 'PRONTO' | 'SERVIDO' | 'AGUARDANDO';
export type TransactionType = 'Receita' | 'Despesa' | 'Gorjeta' | 'Abertura de Caixa';
export type DiscountType = 'percentage' | 'fixed_value';
export type PurchaseOrderStatus = 'Rascunho' | 'Enviada' | 'Recebida';
export type ProductionTaskStatus = 'A Fazer' | 'Em Preparo' | 'Concluído' | 'Rascunho';
export type PlanStatus = 'Planejado' | 'Em Andamento' | 'Concluído';

// --- Main Entities ---

export interface Employee {
  id: string;
  name: string;
  pin: string;
  role: 'Gerente' | 'Caixa' | 'Garçom' | 'Cozinha' | string;
  created_at: string;
  user_id: string;
}

export interface Station {
  id: string;
  name: string;
  employee_id: string | null;
  created_at: string;
  user_id: string;
  employees?: Employee; // Relation
}

export interface Hall {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
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
  customer_count?: number;
  employee_id?: string | null;
  created_at: string;
  user_id: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
  user_id: string;
}

export interface IngredientCategory {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  stock: number;
  cost: number;
  min_stock: number;
  category_id: string | null;
  supplier_id: string | null;
  expiration_date: string | null;
  last_movement_at?: string | null;
  is_sellable: boolean;
  price: number | null;
  pos_category_id: string | null;
  station_id: string | null;
  proxy_recipe_id: string | null;
  created_at: string;
  user_id: string;
  ingredient_categories?: { name: string }; // Relation
  suppliers?: { name: string }; // Relation
}

export interface Category { // For Recipes/POS
  id: string;
  name: string;
  created_at: string;
  user_id: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  price: number;
  category_id: string;
  prep_time_in_minutes: number;
  is_available: boolean;
  is_sub_recipe: boolean;
  source_ingredient_id: string | null;
  proxy_recipe_id?: string | null;
  operational_cost?: number;
  created_at: string;
  user_id: string;
  hasStock?: boolean; // App-level property
}

export interface Order {
  id: string;
  table_number: number;
  is_completed: boolean;
  completed_at: string | null;
  order_type: 'Dine-in' | 'QuickSale';
  timestamp: string;
  created_at: string;
  user_id: string;
  order_items: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  recipe_id: string;
  name: string;
  quantity: number;
  price: number;
  notes: string | null;
  status: OrderItemStatus;
  station_id: string;
  group_id: string | null;
  status_timestamps: any;
  created_at: string;
  user_id: string;
}

export interface RecipePreparation {
  id: string;
  recipe_id: string;
  station_id: string;
  name: string;
  display_order: number;
  created_at: string;
  user_id: string;
}

export interface RecipeIngredient {
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  preparation_id: string;
  user_id: string;
  ingredients?: { name: string; unit: string; cost: number }; // Relation
}

export interface RecipeSubRecipe {
  parent_recipe_id: string;
  child_recipe_id: string;
  quantity: number;
  user_id: string;
  recipes?: { name: string, id: string }; // Relation
}

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  created_at: string;
  user_id: string;
}

export interface PromotionRecipe {
  promotion_id: string;
  recipe_id: string;
  discount_type: DiscountType;
  discount_value: number;
  user_id: string;
  recipes?: { name: string }; // Relation
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  employee_id: string | null;
  created_at: string;
  user_id: string;
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
  payment_summary: any[];
  notes: string | null;
  user_id: string;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  created_at: string;
  user_id: string;
  suppliers?: { name: string }; // Relation
  purchase_order_items?: PurchaseOrderItem[]; // Relation
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  quantity: number;
  cost: number;
  created_at: string;
  user_id: string;
  ingredients?: { name: string, unit: string }; // Relation
}

export interface ProductionPlan {
  id: string;
  plan_date: string;
  status: PlanStatus | null;
  notes: string | null;
  created_at: string;
  user_id: string;
  production_tasks: ProductionTask[]; // Relation
}

export interface ProductionTask {
  id: string;
  production_plan_id: string;
  sub_recipe_id: string | null;
  predicted_demand_quantity?: number | null;
  custom_task_name: string | null;
  quantity_to_produce: number;
  station_id: string;
  employee_id: string | null;
  status: ProductionTaskStatus;
  created_at: string;
  user_id: string;
  recipes?: { name: string }; // Relation
  stations?: { name: string }; // Relation
  employees?: { name: string }; // Relation
}