import { Recipe, RecipePreparation, RecipeIngredient, RecipeSubRecipe, IngredientUnit, Order, IfoodOrderStatus, OrderItem } from './db.models';

// Represents the data structure for the technical sheet form
export interface RecipeForm {
  recipe: Partial<Recipe>;
  preparations: (Partial<RecipePreparation> & { id: string })[];
  ingredients: (Omit<RecipeIngredient, 'user_id' | 'recipe_id'> & { unit: IngredientUnit })[];
  subRecipes: Omit<RecipeSubRecipe, 'user_id' | 'parent_recipe_id'>[];
  image_file?: File | null;
}

// Represents a complete recipe object with all its relations for display
export interface FullRecipe extends Recipe {
    preparations: RecipePreparation[];
    ingredients: (RecipeIngredient & { name: string; unit: string; cost: number })[];
    subRecipes: (RecipeSubRecipe & { name: string; cost: number })[];
    cost: { totalCost: number; ingredientCount: number; rawIngredients: Map<string, number> };
}

// New types for iFood KDS
export type LogisticsStatus = 'AWAITING_DRIVER' | 'ASSIGNED' | 'GOING_TO_ORIGIN' | 'ARRIVED_AT_ORIGIN' | 'DISPATCHED_TO_CUSTOMER' | 'ARRIVED_AT_DESTINATION';

export interface ProcessedIfoodOrder extends Order {
  elapsedTime: number;
  isLate: boolean;
  timerColor: string;
  ifoodStatus: IfoodOrderStatus;
  logisticsStatus: LogisticsStatus | null;
  requiresDeliveryCode: boolean;
  paymentDetails: string;
  changeDue?: number;
  isScheduledAndHeld?: boolean;
  timeToPrepare?: number; // seconds
  holdReason?: 'schedule' | 'stagger';
  totalAmount?: number;
  subTotal?: number;
  deliveryFee?: number;
  additionalFees?: number;
  disputeEvidences?: string[];
}