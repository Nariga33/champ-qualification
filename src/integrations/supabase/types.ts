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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      call_analyses: {
        Row: {
          classification: string | null
          company: string | null
          created_at: string
          id: string
          insights: Json | null
          label: string | null
          operation: Database["public"]["Enums"]["operation_type"] | null
          qualification_model: string | null
          score: number | null
          score_reasoning: string | null
          segment_id: string | null
          summary: string | null
          transcript: string | null
          user_id: string
        }
        Insert: {
          classification?: string | null
          company?: string | null
          created_at?: string
          id?: string
          insights?: Json | null
          label?: string | null
          operation?: Database["public"]["Enums"]["operation_type"] | null
          qualification_model?: string | null
          score?: number | null
          score_reasoning?: string | null
          segment_id?: string | null
          summary?: string | null
          transcript?: string | null
          user_id: string
        }
        Update: {
          classification?: string | null
          company?: string | null
          created_at?: string
          id?: string
          insights?: Json | null
          label?: string | null
          operation?: Database["public"]["Enums"]["operation_type"] | null
          qualification_model?: string | null
          score?: number | null
          score_reasoning?: string | null
          segment_id?: string | null
          summary?: string | null
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_analyses_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          objective: string | null
          operation: Database["public"]["Enums"]["operation_type"] | null
          pain: string | null
          preview: string | null
          segment_id: string | null
          stage: string | null
          subject: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          objective?: string | null
          operation?: Database["public"]["Enums"]["operation_type"] | null
          pain?: string | null
          preview?: string | null
          segment_id?: string | null
          stage?: string | null
          subject: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          objective?: string | null
          operation?: Database["public"]["Enums"]["operation_type"] | null
          pain?: string | null
          preview?: string | null
          segment_id?: string | null
          stage?: string | null
          subject?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          approved_by: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          example: string | null
          id: string
          operation: Database["public"]["Enums"]["operation_type"]
          priority: string
          segment_id: string
          source: Database["public"]["Enums"]["knowledge_source"]
          source_ref: string | null
          status: Database["public"]["Enums"]["knowledge_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          example?: string | null
          id?: string
          operation: Database["public"]["Enums"]["operation_type"]
          priority?: string
          segment_id: string
          source?: Database["public"]["Enums"]["knowledge_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          example?: string | null
          id?: string
          operation?: Database["public"]["Enums"]["operation_type"]
          priority?: string
          segment_id?: string
          source?: Database["public"]["Enums"]["knowledge_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          operation: Database["public"]["Enums"]["operation_type"]
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          operation?: Database["public"]["Enums"]["operation_type"]
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          operation?: Database["public"]["Enums"]["operation_type"]
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          knowledge: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          knowledge?: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          knowledge?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "sdr"
      knowledge_source: "manual" | "pdf" | "call"
      knowledge_status: "pending" | "active" | "inactive" | "rejected"
      operation_type: "outbound" | "inbound"
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

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "sdr"],
      knowledge_source: ["manual", "pdf", "call"],
      knowledge_status: ["pending", "active", "inactive", "rejected"],
      operation_type: ["outbound", "inbound"],
    },
  },
} as const
