const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');

const s1 = 'menu_item_option_groups: {';
const s2 = '      menu_items: {';
const i1 = content.indexOf(s1);
const i2 = content.indexOf(s2);

if (i1 > -1 && i2 > -1) {
  const replacement = `menu_item_option_groups: {
        Row: {
          id: string
          user_id: string
          menu_item_id: string
          name: string
          min_choices: number
          max_choices: number
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          menu_item_id: string
          name: string
          min_choices?: number
          max_choices?: number
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          menu_item_id?: string
          name?: string
          min_choices?: number
          max_choices?: number
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_option_groups_menu_item_id_fkey",
            columns: ["menu_item_id"],
            isOneToOne: false,
            referencedRelation: "menu_items",
            referencedColumns: ["id"]
          }
        ]
      }
      menu_item_option_choices: {
        Row: {
          id: string
          user_id: string
          menu_item_option_id: string
          recipe_id: string
          custom_name: string | null
          additional_price: number
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          menu_item_option_id: string
          recipe_id: string
          custom_name?: string | null
          additional_price?: number
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          menu_item_option_id?: string
          recipe_id?: string
          custom_name?: string | null
          additional_price?: number
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_option_choices_menu_item_option_id_fkey",
            columns: ["menu_item_option_id"],
            isOneToOne: false,
            referencedRelation: "menu_item_option_groups",
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_option_choices_recipe_id_fkey",
            columns: ["recipe_id"],
            isOneToOne: false,
            referencedRelation: "recipes",
            referencedColumns: ["id"]
          }
        ]
      }
`;
  content = content.substring(0, i1) + replacement + content.substring(i2);
  fs.writeFileSync('src/types.ts', content);
}
