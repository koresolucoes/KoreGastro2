import {
  CompanyProfile,
  Role,
  RolePermission,
  Employee,
  Webhook,
  Hall,
  Table,
  Station,
  Customer,
  Order,
  Category,
  Recipe,
  Promotion,
  PromotionRecipe,
  RecipeIngredient,
  RecipePreparation,
  RecipeSubRecipe,
  StoreCustomPrice,
  Ingredient,
  IngredientCategory,
  Supplier,
  StationStock,
  DeliveryDriver,
  LoyaltySettings,
  LoyaltyReward,
  ReservationSettings,
  IfoodWebhookLog
} from './db.models';

export interface CoreDataLoadResult {
  companyProfile: CompanyProfile | null;
  roles: Role[];
  rolePermissions: RolePermission[];
  employees: Employee[];
  webhooks: Webhook[];
}

export interface PosDataLoadResult {
  halls: Hall[];
  tables: Table[];
  stations: Station[];
  customers: Customer[];
  orders: Order[];
}

export interface CatalogDataLoadResult {
  categories: Category[];
  recipes: Recipe[];
  promotions: Promotion[];
  promotionRecipes: PromotionRecipe[];
  recipeIngredients: RecipeIngredient[];
  recipePreparations: RecipePreparation[];
  recipeSubRecipes: RecipeSubRecipe[];
  storeCustomPrices: StoreCustomPrice[];
}

export interface InventoryDataLoadResult {
  ingredients: Ingredient[];
  ingredientCategories: IngredientCategory[];
  suppliers: Supplier[];
  stationStocks: StationStock[];
}

export interface OperationsDataLoadResult {
  deliveryDrivers: DeliveryDriver[];
  loyaltySettings: LoyaltySettings | null;
  loyaltyRewards: LoyaltyReward[];
  reservationSettings: ReservationSettings | null;
  paymentTerminals: any[];
  ifoodWebhookLogs: IfoodWebhookLog[];
}
