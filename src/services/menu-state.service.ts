import { Injectable, computed, inject, signal } from '@angular/core';
import { Menu, MenuCategory, MenuItem, MenuItemOption, MenuItemOptionChoice } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class MenuStateService {
  menus = signal<Menu[]>([]);
  categories = signal<MenuCategory[]>([]);
  items = signal<MenuItem[]>([]);
  options = signal<MenuItemOption[]>([]);
  optionChoices = signal<MenuItemOptionChoice[]>([]);

  // Computed: menus com toda a árvore
  menusWithRelations = computed(() => {
    const menus = this.menus();
    const categories = this.categories();
    const items = this.items();
    const options = this.options();
    const choices = this.optionChoices();

    return menus.map(menu => {
      const menuCategories = categories
        .filter(c => c.menu_id === menu.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(cat => {
          const catItems = items
            .filter(i => i.menu_category_id === cat.id)
            .sort((a, b) => a.display_order - b.display_order)
            .map(item => {
              const itemOptions = options
                .filter(o => o.menu_item_id === item.id)
                .sort((a, b) => a.display_order - b.display_order)
                .map(opt => {
                  const optChoices = choices
                    .filter(c => c.menu_item_option_id === opt.id)
                    .sort((a, b) => a.display_order - b.display_order);
                  return { ...opt, choices: optChoices };
                });
              return { ...item, options: itemOptions };
            });
          return { ...cat, items: catItems };
        });
      return { ...menu, categories: menuCategories };
    });
  });

  setMenus(data: Menu[]) { this.menus.set(data); }
  setCategories(data: MenuCategory[]) { this.categories.set(data); }
  setItems(data: MenuItem[]) { this.items.set(data); }
  setOptions(data: MenuItemOption[]) { this.options.set(data); }
  setOptionChoices(data: MenuItemOptionChoice[]) { this.optionChoices.set(data); }
}
