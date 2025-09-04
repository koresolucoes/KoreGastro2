import { Component, ChangeDetectionStrategy, input, output, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullRecipe, RecipeForm } from '../../../models/app.models';
import { TechnicalSheetDetailsComponent } from '../technical-sheet-details/technical-sheet-details.component';
import { TechnicalSheetEditorComponent } from '../technical-sheet-editor/technical-sheet-editor.component';

@Component({
  selector: 'app-technical-sheet-modal',
  standalone: true,
  imports: [CommonModule, TechnicalSheetDetailsComponent, TechnicalSheetEditorComponent],
  templateUrl: './technical-sheet-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetModalComponent {
  recipe = input<FullRecipe | null>();
  mode = input.required<'view' | 'edit' | 'add'>();
  
  close = output<void>();
  save = output<RecipeForm>();

  isEditing = signal(false);

  constructor() {
    effect(() => {
      const currentMode = this.mode();
      untracked(() => {
        this.isEditing.set(currentMode === 'edit' || currentMode === 'add');
      });
    });
  }

  switchToEditMode() {
    this.isEditing.set(true);
  }

  handleSave(event: RecipeForm) {
    this.save.emit(event);
  }
}
