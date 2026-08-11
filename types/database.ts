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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      map_ingest_runs: {
        Row: {
          attempted_query_count: number
          collector_version: string
          completed_at: string | null
          created_at: string
          deactivated_row_count: number
          discovered_row_count: number
          id: number
          inserted_row_count: number
          provider: string
          sanitized_error_summary: string | null
          saturated_query_count: number
          started_at: string
          status: string
          updated_row_count: number
        }
        Insert: {
          attempted_query_count?: number
          collector_version: string
          completed_at?: string | null
          created_at?: string
          deactivated_row_count?: number
          discovered_row_count?: number
          id?: never
          inserted_row_count?: number
          provider: string
          sanitized_error_summary?: string | null
          saturated_query_count?: number
          started_at?: string
          status: string
          updated_row_count?: number
        }
        Update: {
          attempted_query_count?: number
          collector_version?: string
          completed_at?: string | null
          created_at?: string
          deactivated_row_count?: number
          discovered_row_count?: number
          id?: never
          inserted_row_count?: number
          provider?: string
          sanitized_error_summary?: string | null
          saturated_query_count?: number
          started_at?: string
          status?: string
          updated_row_count?: number
        }
        Relationships: []
      }
      map_places: {
        Row: {
          category_code: string | null
          category_group: string | null
          content_type_id: number | null
          created_at: string
          district_name: string | null
          expires_at: string | null
          fetched_at: string
          first_seen_at: string
          id: number
          image_url: string | null
          is_active: boolean
          last_seen_at: string
          location: unknown
          lot_address: string | null
          name: string
          pet_evidence: Json
          pet_evidence_status: string
          pet_notes: string | null
          phone: string | null
          provider: string
          provider_place_id: string
          road_address: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          category_code?: string | null
          category_group?: string | null
          content_type_id?: number | null
          created_at?: string
          district_name?: string | null
          expires_at?: string | null
          fetched_at?: string
          first_seen_at?: string
          id?: never
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          location: unknown
          lot_address?: string | null
          name: string
          pet_evidence?: Json
          pet_evidence_status: string
          pet_notes?: string | null
          phone?: string | null
          provider: string
          provider_place_id: string
          road_address?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          category_code?: string | null
          category_group?: string | null
          content_type_id?: number | null
          created_at?: string
          district_name?: string | null
          expires_at?: string | null
          fetched_at?: string
          first_seen_at?: string
          id?: never
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          location?: unknown
          lot_address?: string | null
          name?: string
          pet_evidence?: Json
          pet_evidence_status?: string
          pet_notes?: string | null
          phone?: string | null
          provider?: string
          provider_place_id?: string
          road_address?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_map_places_in_bounds: {
        Args: {
          p_categories?: string[]
          p_east: number
          p_north: number
          p_providers?: string[]
          p_result_limit?: number
          p_south: number
          p_west: number
        }
        Returns: {
          category_code: string
          category_group: string
          content_type_id: number
          district_name: string
          fetched_at: string
          id: number
          image_url: string
          latitude: number
          longitude: number
          lot_address: string
          name: string
          pet_evidence: Json
          pet_evidence_status: string
          pet_notes: string
          phone: string
          provider: string
          provider_place_id: string
          road_address: string
          source_url: string
        }[]
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const

