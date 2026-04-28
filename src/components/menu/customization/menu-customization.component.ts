
import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, IfoodOptionGroup, IfoodOption } from '../../../models/db.models';

@Component({
  selector: 'app-menu-customization',
  imports: [CommonModule],
  template: `
    @if (recipe()) {
      <div class="fixed inset-0 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
        <div class="bg-surface w-full max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transform transition-all duration-300 translate-y-0">
          
          <!-- Header -->
          <div class="relative h-48 sm:h-56 bg-surface-elevated shrink-0">
            @if (recipe()?.image_url) {
              <img [src]="recipe()?.image_url" [alt]="recipe()?.name" class="w-full h-full object-cover" referrerpolicy="no-referrer">
            } @else {
              <div class="w-full h-full flex items-center justify-center bg-surface-elevated text-muted">
                <span class="material-symbols-outlined !text-6xl">restaurant</span>
              </div>
            }
            <button (click)="close.emit()" class="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-colors">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Content -->
          <div class="p-6 overflow-y-auto space-y-8">
            <div>
              <h2 class="text-2xl font-bold text-title leading-tight">{{ recipe()?.name }}</h2>
              @if (recipe()?.description) {
                <p class="mt-2 text-muted leading-relaxed">{{ recipe()?.description }}</p>
              }
            </div>

            <!-- Option Groups -->
            @for (group of groups(); track group.id) {
              <div class="space-y-4">
                <div class="flex items-center justify-between pb-2 border-b border-subtle">
                  <div>
                    <h3 class="font-bold text-title">{{ group.name }}</h3>
                    <p class="text-xs text-muted">
                      @if (group.min_required > 0) {
                        Obrigatório • 
                      }
                      Selecione @if (group.min_required == group.max_options) {
                        {{ group.min_required }}
                      } @else {
                        até {{ group.max_options }}
                      }
                    </p>
                  </div>
                  @let count = getSelectedCount(group.id);
                  <span [class]="count >= group.min_required ? 'bg-brand/10 text-brand' : 'bg-surface-elevated text-muted'" 
                        class="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                    {{ count }}/{{ group.max_options }}
                  </span>
                </div>

                <div class="space-y-1">
                  @for (option of group.ifood_options; track option.id) {
                    <button (click)="toggleOption(group, option)" 
                            class="w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 text-left group"
                            [class]="isOptionSelected(option.id) ? 'border-brand bg-brand/5' : 'border-subtle hover:border-strong active:scale-[0.98]'">
                      <div class="flex-1">
                        <p class="font-medium text-title group-hover:text-brand transition-colors">{{ option.name }}</p>
                        @if (option.price > 0) {
                          <p class="text-sm font-bold text-brand">+ {{ option.price | currency : 'BRL' }}</p>
                        }
                      </div>
                      <div class="ml-4 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200"
                           [class]="isOptionSelected(option.id) ? 'bg-brand text-on-brand shadow-lg shadow-brand/20' : 'bg-surface-elevated text-transparent'">
                        <span class="material-symbols-outlined !text-sm font-bold">check</span>
                      </div>
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Notes -->
            <div class="space-y-3">
              <div class="flex items-center gap-2 text-title font-bold mb-1">
                <span class="material-symbols-outlined text-muted">notes</span>
                <h3>Observações</h3>
              </div>
              <textarea (input)="updateNotes($event)"
                        placeholder="Alguma recomendação importante? Ex: Sem cebola, ponto da carne..."
                        class="w-full p-4 bg-surface-elevated border-2 border-transparent focus:border-strong focus:bg-surface rounded-2xl text-body outline-none transition-all duration-200 min-h-[100px] resize-none"></textarea>
            </div>
          </div>

          <!-- Footer -->
          <div class="p-6 bg-surface border-t border-subtle shrink-0">
            <button (click)="onConfirm()"
                    [disabled]="!isValid()"
                    class="w-full py-4 px-6 bg-brand disabled:opacity-50 text-on-brand rounded-2xl font-bold flex items-center justify-between transition-all duration-300 enabled:hover:opacity-90 enabled:active:scale-[0.98] shadow-xl group">
              <span class="flex items-center gap-3">
                <span class="material-symbols-outlined group-hover:translate-x-1 transition-transform">shopping_bag</span>
                {{ isValid() ? 'Adicionar ao carrinho' : 'Selecione os itens obrigatórios' }}
              </span>
              <span class="text-lg">{{ totalPrice() | currency : 'BRL' }}</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
  `]
})
export class MenuCustomizationComponent {
  recipe = input<Recipe | null>(null);
  groups = input<IfoodOptionGroup[]>([]);
  basePrice = input<number>(0);
  
  confirm = output<{ options: IfoodOption[], notes: string }>();
  close = output<void>();

  selectedOptions = signal<IfoodOption[]>([]);
  notes = signal<string>('');

  totalPrice = computed(() => {
    const optionsTotal = this.selectedOptions().reduce((sum, opt) => sum + opt.price, 0);
    return this.basePrice() + optionsTotal;
  });

  isValid = computed(() => {
    return this.groups().every(group => {
      const count = this.getSelectedCount(group.id);
      return count >= group.min_required && count <= group.max_options;
    });
  });

  getSelectedCount(groupId: string): number {
    return this.selectedOptions().filter(o => o.ifood_option_group_id === groupId).length;
  }

  isOptionSelected(optionId: string): boolean {
    return this.selectedOptions().some(o => o.id === optionId);
  }

  toggleOption(group: IfoodOptionGroup, option: IfoodOption) {
    this.selectedOptions.update(current => {
      const isSelected = current.some(o => o.id === option.id);
      const groupCount = current.filter(o => o.ifood_option_group_id === group.id).length;

      if (isSelected) {
        return current.filter(o => o.id !== option.id);
      } else {
        // If it's a single selection group (min=1, max=1) and we add a new one, replace the existing one
        if (group.max_options === 1) {
          return [...current.filter(o => o.ifood_option_group_id !== group.id), option];
        }
        
        // Only add if under max options
        if (groupCount < group.max_options) {
          return [...current, option];
        }
      }
      return current;
    });
  }

  updateNotes(event: Event) {
    this.notes.set((event.target as HTMLTextAreaElement).value);
  }

  onConfirm() {
    if (this.isValid()) {
      this.confirm.emit({
        options: this.selectedOptions(),
        notes: this.notes()
      });
      this.selectedOptions.set([]);
      this.notes.set('');
    }
  }
}
