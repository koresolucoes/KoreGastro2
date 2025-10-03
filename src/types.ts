import { Tables } from "./supabase";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bar_locations: {
        Row: {
          id: string
          bar_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_locations_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      bars: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          opening_hours: string | null
          owner_id: string | null
          chefos_restaurant_id: string | null
          chefos_api_key: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          opening_hours?: string | null
          owner_id?: string | null
          chefos_restaurant_id?: string | null
          chefos_api_key?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_hours?: string | null
          owner_id?: string | null
          chefos_restaurant_id?: string | null
          chefos_api_key?: string | null
        }
        Relationships: []
      }
      coinflip_bets: {
        Row: {
            id: string
            game_id: string
            user_id: string
            choice: "heads" | "tails"
            points_bet: number
            created_at: string
        }
        Insert: {
            id?: string
            game_id: string
            user_id: string
            choice: "heads" | "tails"
            points_bet: number
            created_at?: string
        }
        Update: {
            id?: string
            game_id?: string
            user_id?: string
            choice?: "heads" | "tails"
            points_bet?: number
            created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coinflip_bets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "coinflip_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coinflip_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      coinflip_games: {
        Row: {
            id: string
            bar_id: string
            created_at: string
            created_by: string
            status: string
            coin_result: "heads" | "tails" | null
            winner_choice: "heads" | "tails" | null
        }
        Insert: {
            id?: string
            bar_id: string
            created_at?: string
            created_by: string
            status?: string
            coin_result?: "heads" | "tails" | null
            winner_choice?: "heads" | "tails" | null
        }
        Update: {
            id?: string
            bar_id?: string
            created_at?: string
            created_by?: string
            status?: string
            coin_result?: "heads" | "tails" | null
            winner_choice?: "heads" | "tails" | null
        }
        Relationships: [
          {
            foreignKeyName: "coinflip_games_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coinflip_games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      menu_categories: {
        Row: {
          id: string
          bar_id: string
          name: string
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          name: string
          order: number
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          name?: string
          order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          }
        ]
      }
      menu_items: {
        Row: {
          id: string
          category_id: string
          name: string
          description: string | null
          price: number
          order: number
          created_at: string
          chefos_external_code: string | null
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          description?: string | null
          price: number
          order: number
          created_at?: string
          chefos_external_code?: string | null
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          description?: string | null
          price?: number
          order?: number
          created_at?: string
          chefos_external_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      missions: {
        Row: {
          bar_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          points: number
          title: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          points?: number
          title: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          points?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      point_history: {
        Row: {
          bar_id: string
          created_at: string
          id: string
          points_change: number
          reason: string
          redemption_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          id?: string
          points_change: number
          reason: string
          redemption_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          id?: string
          points_change?: number
          reason?: string
          redemption_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_history_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_history_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "reward_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          bar_id: string
          created_at: string
          id: string
          points_cost: number
          reward_id: string
          user_id: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          id?: string
          points_cost: number
          reward_id: string
          user_id: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          id?: string
          points_cost?: number
          reward_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          bar_id: string
          cost: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          bar_id: string
          cost: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          bar_id?: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          bar_id: string
          created_at: string
          id: string
          points_earned: number
          user_id: string
        }
        Insert: {
          amount: number
          bar_id: string
          created_at?: string
          id?: string
          points_earned: number
          user_id: string
        }
        Update: {
          amount?: number
          bar_id?: string
          created_at?: string
          id?: string
          points_earned?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_questions: {
        Row: {
          correct_answer: string
          id: string
          options: Json
          order: number
          question: string
          trivia_set_id: string
        }
        Insert: {
          correct_answer: string
          id?: string
          options: Json
          order?: number
          question: string
          trivia_set_id: string
        }
        Update: {
          correct_answer?: string
          id?: string
          options?: Json
          order?: number
          question?: string
          trivia_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trivia_questions_trivia_set_id_fkey"
            columns: ["trivia_set_id"]
            isOneToOne: false
            referencedRelation: "trivia_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_sets: {
        Row: {
          bar_id: string
          created_at: string
          id: string
          is_active: boolean
          points_reward: number
          title: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          points_reward?: number
          title: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          points_reward?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "trivia_sets_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      user_missions: {
        Row: {
          completed_at: string | null
          is_completed: boolean
          mission_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          is_completed?: boolean
          mission_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          is_completed?: boolean
          mission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_missions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string
          avatar_url: string | null
          bar_id: string
          created_at: string
          id: string
          is_anonymous: boolean
          last_seen: string | null
          name: string
          points: number
          current_location: string | null
          checked_in_at: string | null
        }
        Insert: {
          auth_id: string
          avatar_url?: string | null
          bar_id: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          last_seen?: string | null
          name: string
          points?: number
          current_location?: string | null
          checked_in_at?: string | null
        }
        Update: {
          auth_id?: string
          avatar_url?: string | null
          bar_id?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          last_seen?: string | null
          name?: string
          points?: number
          current_location?: string | null
          checked_in_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          id: string
          bar_id: string
          user_id: string
          created_at: string
          total_amount: number
          table_number: string
          chefos_order_id: string | null
          status: string
        }
        Insert: {
          id?: string
          bar_id: string
          user_id: string
          created_at?: string
          total_amount: number
          table_number: string
          chefos_order_id?: string | null
          status?: string
        }
        Update: {
          id?: string
          bar_id?: string
          user_id?: string
          created_at?: string
          total_amount?: number
          table_number?: string
          chefos_order_id?: string | null
          status?: string
        }
        Relationships: [
            {
                foreignKeyName: "orders_bar_id_fkey",
                columns: ["bar_id"],
                referencedRelation: "bars",
                referencedColumns: ["id"]
            },
            {
                foreignKeyName: "orders_user_id_fkey",
                columns: ["user_id"],
                referencedRelation: "users",
                referencedColumns: ["id"]
            }
        ]
      }
      order_items: {
          Row: {
              id: string
              order_id: string
              menu_item_id: string
              quantity: number
              price: number
              notes: string | null
          }
          Insert: {
              id?: string
              order_id: string
              menu_item_id: string
              quantity: number
              price: number
              notes?: string | null
          }
          Update: {
              id?: string
              order_id?: string
              menu_item_id?: string
              quantity?: number
              price?: number
              notes?: string | null
          }
          Relationships: [
              {
                  foreignKeyName: "order_items_order_id_fkey",
                  columns: ["order_id"],
                  referencedRelation: "orders",
                  referencedColumns: ["id"]
              },
              {
                  foreignKeyName: "order_items_menu_item_id_fkey",
                  columns: ["menu_item_id"],
                  referencedRelation: "menu_items",
                  referencedColumns: ["id"]
              }
          ]
      }
    }
    Views: {
      // FIX: Added the 'global_user_rankings' view to the Database type definition.
      // This allows the Supabase client to correctly infer types for queries to this view.
      global_user_rankings: {
        Row: {
          id: string
          name: string
          avatar_url: string | null
          points: number
          bar_name: string
        }
        Relationships: []
      }
    }
    Functions: {
      award_points_to_user: {
        Args: {
          p_user_id: string
          p_bar_id: string
          p_points_to_add: number
          p_reason: string
        }
        Returns: number
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      link_anonymous_user: {
        Args: { anonymous_user_id: string }
        Returns: undefined
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      process_bar_transaction: {
        Args: {
          p_amount: number
          p_bar_id: string
          p_mission_ids: string[]
          p_user_id: string
        }
        Returns: number
      }
      process_transaction_and_missions: {
        Args: {
          p_amount: number
          p_bar_id: string
          p_mission_ids: string[]
          p_user_id: string
        }
        Returns: number
      }
      redeem_bar_reward: {
        Args: { p_bar_id: string; p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      redeem_reward: {
        Args: { p_bar_id: string; p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export type Bar = Tables<'bars'>;
export type BarLocation = Tables<'bar_locations'>;
export type Profile = Tables<'profiles'>;
export type User = Tables<'users'>;
export type Reward = Tables<'rewards'>;
export type Mission = Tables<'missions'>;
export type UserMission = Tables<'user_missions'>;
export type PointHistory = Tables<'point_history'>;
export type CoinflipGame = Tables<'coinflip_games'>;
export type CoinflipBet = Tables<'coinflip_bets'>;
export type TriviaSet = Tables<'trivia_sets'>;
export type TriviaQuestionDB = Tables<'trivia_questions'> & { options: string[] }; // The table stores JSONB, but we'll use it as string[]
export type TriviaSetWithQuestions = TriviaSet & {
  trivia_questions: TriviaQuestionDB[];
};
export type ClientMission = Mission & { isCompleted: boolean; };
export type CoinflipGameWithBetsAndUsers = CoinflipGame & {
    coinflip_bets: (CoinflipBet & { users: Pick<User, 'id' | 'name' | 'avatar_url'> | null })[];
    users: Pick<User, 'id' | 'name' | 'avatar_url'> | null; // Creator
};
// FIX: Added 'GameInvite' type definition to resolve an import error in GameInvitationModal.tsx.
// This type represents an invitation to a game between two players.
export type GameInvite = {
  game_type: 'coin_flip' | 'checkers';
  inviter_details?: {
    avatar_url: string | null;
    name: string | null;
  } | null;
  wager: number;
};
export type GlobalRankUser = {
  id: string;
  name: string;
  avatar_url: string | null;
  points: number;
  bar_name: string;
};
export type MenuCategory = Tables<'menu_categories'>;
export type MenuItem = Tables<'menu_items'>;
export type MenuCategoryWithItems = MenuCategory & {
  menu_items: MenuItem[];
};
export type Order = Tables<'orders'>;
export type OrderItem = Tables<'order_items'>;
