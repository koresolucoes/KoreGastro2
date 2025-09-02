
import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { Recipe, Promotion, PromotionRecipe } from '../models/db.models';

@Injectable({
  providedIn: 'root',
})
export class PricingService implements OnDestroy {
  private timer: any;
  
  // Public signals to be set by SupabaseService, breaking the circular dependency.
  promotions = signal<Promotion[]>([]);
  promotionRecipes = signal<PromotionRecipe[]>([]);

  // A signal that updates periodically to trigger computations involving time.
  private currentTime = signal(new Date());

  constructor() {
    // Update the current time every 30 seconds to re-evaluate active promotions.
    this.timer = setInterval(() => {
      this.currentTime.set(new Date());
    }, 30000); 
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private activePromotionsWithRecipes = computed(() => {
    const now = this.currentTime();
    const currentDay = now.getDay(); // Sunday = 0, Monday = 1, etc.
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const promotions = this.promotions();
    const promotionRecipes = this.promotionRecipes();

    const activePromos = promotions.filter(promo => 
      promo.is_active &&
      promo.days_of_week.includes(currentDay) &&
      promo.start_time <= currentTime &&
      promo.end_time >= currentTime
    );

    if (activePromos.length === 0) {
      return new Map<string, PromotionRecipe>();
    }

    const activePromoIds = new Set(activePromos.map(p => p.id));
    
    const applicableRecipes = promotionRecipes.filter(pr => activePromoIds.has(pr.promotion_id));

    // Create a map of recipe_id -> promotion_recipe for quick lookup.
    // If a recipe is in multiple active promotions, the last one in the list wins.
    const recipePromoMap = new Map<string, PromotionRecipe>();
    for (const pr of applicableRecipes) {
      recipePromoMap.set(pr.recipe_id, pr);
    }
    
    return recipePromoMap;
  });

  /**
   * Calculates the effective price of a recipe, applying any active promotions.
   * @param recipe The recipe to price.
   * @returns The final price after discounts.
   */
  public getEffectivePrice(recipe: Recipe): number {
    if (!recipe) return 0;

    const applicablePromo = this.activePromotionsWithRecipes().get(recipe.id);
    
    if (!applicablePromo) {
      return recipe.price;
    }

    if (applicablePromo.discount_type === 'percentage') {
      const discountAmount = recipe.price * (applicablePromo.discount_value / 100);
      return Math.max(0, recipe.price - discountAmount);
    }

    if (applicablePromo.discount_type === 'fixed_value') {
      return Math.max(0, recipe.price - applicablePromo.discount_value);
    }

    return recipe.price;
  }
}