import { Component, ChangeDetectionStrategy, input, output, computed, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, RecipePreparation, RecipeIngredient, RecipeSubRecipe, IngredientUnit } from '../../../models/db.models';

export interface FullRecipeForModal {
  recipe: Recipe;
  preparations: (RecipePreparation & { 
    ingredients: (RecipeIngredient & { name: string, unit: IngredientUnit, quantity: number })[];
  })[];
  subRecipes: (RecipeSubRecipe & { name: string })[];
}

@Component({
  selector: 'app-mise-en-place-recipe-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mise-en-place-recipe-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiseEnPlaceRecipeModalComponent {
  recipeData: InputSignal<FullRecipeForModal | null> = input.required<FullRecipeForModal | null>();
  close: OutputEmitterRef<void> = output<void>();

  hasIngredients = computed(() => {
    const data = this.recipeData();
    if (!data) {
      return false;
    }
    return data.preparations.flatMap(p => p.ingredients).length > 0;
  });
}