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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ear_training_progress: {
        Row: {
          attempts: number
          correct: number
          created_at: string
          exercise: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          correct?: number
          created_at?: string
          exercise: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          correct?: number
          created_at?: string
          exercise?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pieces: {
        Row: {
          composer: string
          created_at: string
          default_tempo: number
          difficulty: string
          genre: string
          id: string
          key_signature: string
          license: string
          musicxml_status: string
          musicxml_url: string | null
          source_url: string | null
          title: string
        }
        Insert: {
          composer: string
          created_at?: string
          default_tempo?: number
          difficulty: string
          genre: string
          id?: string
          key_signature: string
          license: string
          musicxml_status?: string
          musicxml_url?: string | null
          source_url?: string | null
          title: string
        }
        Update: {
          composer?: string
          created_at?: string
          default_tempo?: number
          difficulty?: string
          genre?: string
          id?: string
          key_signature?: string
          license?: string
          musicxml_status?: string
          musicxml_url?: string | null
          source_url?: string | null
          title?: string
        }
        Relationships: []
      }
      practice_plans: {
        Row: {
          created_at: string
          id: string
          plan: Json
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan: Json
          user_id: string
          week_start?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan?: Json
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      practice_sessions: {
        Row: {
          completed_items: Json
          created_at: string
          day_index: number
          hard_note: string | null
          id: string
          minutes: number
          plan_id: string | null
          session_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_items?: Json
          created_at?: string
          day_index: number
          hard_note?: string | null
          id?: string
          minutes?: number
          plan_id?: string | null
          session_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_items?: Json
          created_at?: string
          day_index?: number
          hard_note?: string | null
          id?: string
          minutes?: number
          plan_id?: string | null
          session_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "practice_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          daily_minutes: number | null
          display_name: string | null
          genre: string | null
          goal: string | null
          id: string
          input_method: string | null
          onboarded: boolean
          proficiency: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_minutes?: number | null
          display_name?: string | null
          genre?: string | null
          goal?: string | null
          id: string
          input_method?: string | null
          onboarded?: boolean
          proficiency?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_minutes?: number | null
          display_name?: string | null
          genre?: string | null
          goal?: string | null
          id?: string
          input_method?: string | null
          onboarded?: boolean
          proficiency?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          accuracy: number | null
          created_at: string
          id: string
          piece_id: string | null
          tempo: number | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          id?: string
          piece_id?: string | null
          tempo?: number | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          id?: string
          piece_id?: string | null
          tempo?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_progress: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          topic: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          topic: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      user_pieces: {
        Row: {
          composer: string | null
          created_at: string
          file_path: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          composer?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          composer?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
