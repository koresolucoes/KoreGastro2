// --- Basic Types ---
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'un';
export type TableStatus = 'LIVRE' | 'OCUPADA' | 'PAGANDO';
export type OrderItemStatus = 'PENDENTE' | 'EM_PREPARO' | 'PRONTO' | 'SERVIDO' | 'AGUARDANDO';
export type TransactionType = 'Receita' | 'Despesa' | 'Gorjeta' | 'Abertura de Caixa';
export type DiscountType = 'percentage' | 'fixed_value';
export type PurchaseOrderStatus = 'Rascunho' | 'Enviada' | 'Recebida';
export type ProductionTaskStatus = 'A Fazer' | 'Em Preparo' | 'Concluído' | 'Rascunho';
export type PlanStatus = 'Planejado' | 'Em Andamento' | 'Concluído';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type LeaveRequestType = 'Férias' | 'Folga' | 'Falta Justificada' | 'Atestado';
export type LeaveRequestStatus = 'Pendente' | 'Aprovada' | 'Rejeitada';
export type LoyaltyRewardType = 'discount_fixed' | 'discount_percentage' | 'free_item';
export type OrderStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type OrderType = 'Dine-in' | 'QuickSale' | 'iFood-Delivery' | 'iFood-Takeout';
export type IfoodOrderStatus = 'RECEIVED' | 'CONFIRMED' | 'IN_PREPARATION' | 'DISPATCHED' | 'READY_FOR_PICKUP' | 'CONCLUDED' | 'CANCELLED';


// --- New Types for Settings ---
export interface OperatingHours {
  day_of_week: number; // 0 for Sunday, 6 for Saturday
  opening_time: string; // "HH:mm"
  closing_time: string; // "HH:mm"
  is_closed: boolean;
}

export interface IfoodOrderDelivery {
    deliveredBy: 'IFOOD' | 'MERCHANT';
    deliveryAddress: {
        streetName: string;
        streetNumber: string;
        neighborhood: string;
        city: string;
        state: string;
        postalCode: string;
        complement?: string;
        reference?: string;
    }
}

// --- Main Entities ---

export interface Role {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

export interface RolePermission {
  role_id: string;
  permission_key: string; // e.g., '/pos', '/inventory'
  user_id: string;
}

export interface Employee {
  id: string;
  name: string;
  pin: string;
  role_id: string | null;
  created_at: string;
  user_id: string;
  current_clock_in_id: string | null;
  salary_type?: 'mensal' | 'horista' | null;
  salary_rate?: number | null;
  overtime_rate_multiplier?: number | null;
  birth_date?: string | null;
  cpf?: string | null;
  rg?: string | null;
  address?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
  bank_details?: { bank?: string; agency?: string; account?: string; pix?: string } | null;
  roles?: { id: string, name: string }; // Relation
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
  external_code: string | null;
  created_at: string;
  user_id: string;
  ingredient_categories?: { name: string }; // Relation
  suppliers?: { name: string }; // Relation
}

export interface InventoryLot {
    id: string;
    ingredient_id: string;
    lot_number: string | null;
    expiration_date: string | null;
    quantity: number;
    user_id: string;
    created_at: string;
}

export interface Category { // For Recipes/POS
  id: string;
  name: string;
  image_url: string | null;
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
  image_url: string | null;
  operational_cost?: number;
  external_code: string | null;
  created_at: string;
  user_id: string;
  hasStock?: boolean; // App-level property
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  notes: string | null;
  created_at: string;
  loyalty_points: number;
}

export interface Order {
  id: string;
  table_number: number;
  status: OrderStatus;
  completed_at: string | null;
  order_type: OrderType;
  timestamp: string;
  customer_id: string | null;
  created_at: string;
  user_id: string;
  order_items: OrderItem[];
  customers?: Customer; // Relation
  
  // iFood fields
  ifood_order_id?: string | null;
  ifood_display_id?: string | null;
  delivery_info?: IfoodOrderDelivery | null; // Stored as JSONB
}

export interface OrderItem {
  id: string;
  order_id: string;
  recipe_id: string | null;
  name: string;
  quantity: number;
  price: number;
  original_price: number;
  discount_type: DiscountType | null;
  discount_value: number | null;
  notes: string | null;
  status: OrderItemStatus;
  station_id: string;
  group_id: string | null;
  status_timestamps: any;
  redeemed_reward_id?: string | null;
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
  lot_number: string | null;
  expiration_date: string | null;
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
  lot_number: string | null;
  total_cost: number | null;
  created_at: string;
  user_id: string;
  recipes?: { name: string, source_ingredient_id: string | null }; // Relation
  stations?: { name: string }; // Relation
  employees?: { name: string }; // Relation
}

export interface ReservationSettings {
  id: string;
  user_id: string;
  is_enabled: boolean;
  weekly_hours: OperatingHours[] | null;
  booking_duration_minutes: number;
  max_party_size: number;
  min_party_size: number;
  booking_notice_days: number;
  created_at: string;
}

export interface Reservation {
  id: string;
  user_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  party_size: number;
  reservation_time: string; // ISO string
  notes: string | null;
  status: ReservationStatus;
  created_at: string;
}

export interface TimeClockEntry {
  id: string;
  user_id: string;
  employee_id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  notes: string | null;
  created_at: string;
  employees?: { name: string }; // Relation
}

// --- HR & Scheduling ---
export interface Schedule {
  id: string;
  user_id: string;
  week_start_date: string; // date string
  is_published: boolean;
  notes: string | null;
  created_at: string;
  shifts: Shift[]; // Relation from join
}

export interface Shift {
  id: string;
  user_id: string;
  schedule_id: string;
  employee_id: string;
  start_time: string; // ISO string
  end_time: string | null; // Can be null for day off
  notes: string | null;
  role_assigned: string | null;
  is_day_off?: boolean;
  created_at: string;
  employees?: { name: string }; // Relation from join
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  employee_id: string;
  request_type: LeaveRequestType;
  status: LeaveRequestStatus;
  start_date: string; // date string
  end_date: string; // date string
  reason: string | null;
  manager_notes: string | null;
  created_at: string;
  updated_at: string;
  employees?: { name: string, role: string }; // Relation
}

export interface CompanyProfile {
  user_id: string;
  company_name: string;
  cnpj: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  ifood_merchant_id: string | null;
  created_at: string;
}

// --- Loyalty Program ---
export interface LoyaltySettings {
  user_id: string;
  is_enabled: boolean;
  points_per_real: number;
  created_at: string;
}

export interface LoyaltyReward {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  points_cost: number;
  reward_type: LoyaltyRewardType;
  reward_value: string; // Can be a recipe ID or a numeric value as a string
  is_active: boolean;
  created_at: string;
}

export interface LoyaltyMovement {
  id: string;
  user_id: string;
  customer_id: string;
  order_id: string | null;
  reward_id: string | null;
  points_change: number;
  description: string;
  created_at: string;
}

export interface IfoodWebhookLog {
  id: string;
  created_at: string;
  user_id: string | null;
  merchant_id: string | null;
  ifood_order_id: string | null;
  event_code: string | null;
  raw_payload: any; // jsonb
  processing_status: string | null;
  error_message: string | null;
}