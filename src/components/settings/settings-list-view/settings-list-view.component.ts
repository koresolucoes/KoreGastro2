import { Component, ChangeDetectionStrategy, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ListItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-settings-list-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-gray-800 p-6 rounded-lg">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold text-white">{{ title() }}</h2>
        <button (click)="addItem.emit()" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-500 text-sm">Adicionar Novo</button>
      </div>
      @if (items().length > 0) {
        <ul class="space-y-2">
          @for (item of items(); track item.id) {
            <li class="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
              <span class="font-medium text-white">{{ item.name }}</span>
              <div class="flex gap-2">
                <button (click)="editItem.emit(item)" class="p-2 text-blue-400 hover:text-blue-300"><span class="material-symbols-outlined">edit</span></button>
                <button (click)="deleteItem.emit(item)" class="p-2 text-red-400 hover:text-red-300"><span class="material-symbols-outlined">delete</span></button>
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="text-center text-gray-500 py-8">Nenhum item cadastrado.</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsListViewComponent {
  title: InputSignal<string> = input.required<string>();
  items: InputSignal<ListItem[]> = input.required<ListItem[]>();
  
  addItem: OutputEmitterRef<void> = output<void>();
  editItem: OutputEmitterRef<ListItem> = output<ListItem>();
  deleteItem: OutputEmitterRef<ListItem> = output<ListItem>();
}
