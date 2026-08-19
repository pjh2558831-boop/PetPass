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
      map_ingest_run_queries: {
        Row: {
          accepted_result_count: number
          candidate_kind: string
          category_group_code: string | null
          classification_rejection_count: number
          collection_run_id: number
          completed_at: string | null
          created_at: string
          district: string
          district_code: string
          duplicate_result_count: number
          id: number
          inserted_row_count: number
          invalid_coordinate_result_count: number
          last_completed_page: number
          normalized_category: string | null
          out_of_district_result_count: number
          preserved_review_row_count: number
          provider_429_count: number
          provider_call_count: number
          provider_error_count: number
          provider_result_count: number
          query_key: string
          query_text: string
          region_id: string
          rejected_result_count: number
          sanitized_error_summary: string | null
          saturated: boolean
          started_at: string | null
          status: string
          timeout_count: number
          updated_at: string
          updated_row_count: number
        }
        Insert: {
          accepted_result_count?: number
          candidate_kind: string
          category_group_code?: string | null
          classification_rejection_count?: number
          collection_run_id: number
          completed_at?: string | null
          created_at?: string
          district: string
          district_code: string
          duplicate_result_count?: number
          id?: never
          inserted_row_count?: number
          invalid_coordinate_result_count?: number
          last_completed_page?: number
          normalized_category?: string | null
          out_of_district_result_count?: number
          preserved_review_row_count?: number
          provider_429_count?: number
          provider_call_count?: number
          provider_error_count?: number
          provider_result_count?: number
          query_key: string
          query_text: string
          region_id: string
          rejected_result_count?: number
          sanitized_error_summary?: string | null
          saturated?: boolean
          started_at?: string | null
          status?: string
          timeout_count?: number
          updated_at?: string
          updated_row_count?: number
        }
        Update: {
          accepted_result_count?: number
          candidate_kind?: string
          category_group_code?: string | null
          classification_rejection_count?: number
          collection_run_id?: number
          completed_at?: string | null
          created_at?: string
          district?: string
          district_code?: string
          duplicate_result_count?: number
          id?: never
          inserted_row_count?: number
          invalid_coordinate_result_count?: number
          last_completed_page?: number
          normalized_category?: string | null
          out_of_district_result_count?: number
          preserved_review_row_count?: number
          provider_429_count?: number
          provider_call_count?: number
          provider_error_count?: number
          provider_result_count?: number
          query_key?: string
          query_text?: string
          region_id?: string
          rejected_result_count?: number
          sanitized_error_summary?: string | null
          saturated?: boolean
          started_at?: string | null
          status?: string
          timeout_count?: number
          updated_at?: string
          updated_row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_ingest_run_queries_region_district_fkey"
            columns: ["region_id", "district_code", "district"]
            isOneToOne: false
            referencedRelation: "region_districts"
            referencedColumns: ["region_id", "district_code", "district_name"]
          },
          {
            foreignKeyName: "map_ingest_run_queries_region_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["region_id"]
          },
          {
            foreignKeyName: "map_ingest_run_queries_region_run_fkey"
            columns: ["region_id", "collection_run_id"]
            isOneToOne: false
            referencedRelation: "map_ingest_runs"
            referencedColumns: ["region_id", "id"]
          },
        ]
      }
      map_ingest_runs: {
        Row: {
          accepted_result_count: number
          attempted_query_count: number
          classification_rejection_count: number
          collector_version: string
          completed_at: string | null
          completed_query_count: number
          created_at: string
          deactivated_row_count: number
          discovered_row_count: number
          duplicate_result_count: number
          id: number
          inserted_row_count: number
          invalid_coordinate_result_count: number
          is_full_catalog_run: boolean
          out_of_district_result_count: number
          pet_shop_count: number
          pet_travel_count: number
          planned_query_count: number
          preserved_review_row_count: number
          provider: string
          provider_429_count: number
          provider_call_count: number
          provider_error_count: number
          provider_result_count: number
          region_id: string
          registry_version: string | null
          rejected_result_count: number
          sanitized_error_summary: string | null
          saturated_query_count: number
          started_at: string
          status: string
          timeout_count: number
          unique_place_count: number
          updated_row_count: number
          veterinary_count: number
        }
        Insert: {
          accepted_result_count?: number
          attempted_query_count?: number
          classification_rejection_count?: number
          collector_version: string
          completed_at?: string | null
          completed_query_count?: number
          created_at?: string
          deactivated_row_count?: number
          discovered_row_count?: number
          duplicate_result_count?: number
          id?: never
          inserted_row_count?: number
          invalid_coordinate_result_count?: number
          is_full_catalog_run?: boolean
          out_of_district_result_count?: number
          pet_shop_count?: number
          pet_travel_count?: number
          planned_query_count?: number
          preserved_review_row_count?: number
          provider: string
          provider_429_count?: number
          provider_call_count?: number
          provider_error_count?: number
          provider_result_count?: number
          region_id: string
          registry_version?: string | null
          rejected_result_count?: number
          sanitized_error_summary?: string | null
          saturated_query_count?: number
          started_at?: string
          status: string
          timeout_count?: number
          unique_place_count?: number
          updated_row_count?: number
          veterinary_count?: number
        }
        Update: {
          accepted_result_count?: number
          attempted_query_count?: number
          classification_rejection_count?: number
          collector_version?: string
          completed_at?: string | null
          completed_query_count?: number
          created_at?: string
          deactivated_row_count?: number
          discovered_row_count?: number
          duplicate_result_count?: number
          id?: never
          inserted_row_count?: number
          invalid_coordinate_result_count?: number
          is_full_catalog_run?: boolean
          out_of_district_result_count?: number
          pet_shop_count?: number
          pet_travel_count?: number
          planned_query_count?: number
          preserved_review_row_count?: number
          provider?: string
          provider_429_count?: number
          provider_call_count?: number
          provider_error_count?: number
          provider_result_count?: number
          region_id?: string
          registry_version?: string | null
          rejected_result_count?: number
          sanitized_error_summary?: string | null
          saturated_query_count?: number
          started_at?: string
          status?: string
          timeout_count?: number
          unique_place_count?: number
          updated_row_count?: number
          veterinary_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_ingest_runs_region_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["region_id"]
          },
        ]
      }
      map_place_query_hits: {
        Row: {
          candidate_id: number
          category_group_code: string | null
          collection_run_id: number
          discovered_at: string
          district: string
          district_code: string
          id: number
          page: number
          query_key: string
          query_text: string
          region_id: string
          result_rank: number
        }
        Insert: {
          candidate_id: number
          category_group_code?: string | null
          collection_run_id: number
          discovered_at?: string
          district: string
          district_code: string
          id?: never
          page: number
          query_key: string
          query_text: string
          region_id: string
          result_rank: number
        }
        Update: {
          candidate_id?: number
          category_group_code?: string | null
          collection_run_id?: number
          discovered_at?: string
          district?: string
          district_code?: string
          id?: never
          page?: number
          query_key?: string
          query_text?: string
          region_id?: string
          result_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_place_query_hits_candidate_region_fkey"
            columns: ["region_id", "candidate_id"]
            isOneToOne: false
            referencedRelation: "map_places"
            referencedColumns: ["region_id", "id"]
          },
          {
            foreignKeyName: "map_place_query_hits_query_region_fkey"
            columns: ["region_id", "collection_run_id", "query_key"]
            isOneToOne: false
            referencedRelation: "map_ingest_run_queries"
            referencedColumns: ["region_id", "collection_run_id", "query_key"]
          },
          {
            foreignKeyName: "map_place_query_hits_region_district_fkey"
            columns: ["region_id", "district_code", "district"]
            isOneToOne: false
            referencedRelation: "region_districts"
            referencedColumns: ["region_id", "district_code", "district_name"]
          },
          {
            foreignKeyName: "map_place_query_hits_region_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["region_id"]
          },
        ]
      }
      map_places: {
        Row: {
          candidate_kind: string | null
          category_code: string | null
          category_group: string | null
          category_group_code: string | null
          category_group_name: string | null
          category_name: string | null
          content_type_id: number | null
          created_at: string
          district_code: string | null
          district_name: string | null
          expires_at: string | null
          fetched_at: string
          first_seen_at: string
          id: number
          image_url: string | null
          is_active: boolean
          last_seen_at: string
          last_seen_run_id: number | null
          lifecycle_status: string | null
          location: unknown
          lot_address: string | null
          name: string
          normalized_category: string | null
          pending_publication_run_id: number | null
          pet_evidence: Json
          pet_evidence_status: string
          pet_notes: string | null
          phone: string | null
          provider: string
          provider_place_id: string
          provider_visibility: string
          public_visibility: boolean | null
          region_id: string
          requires_recheck: boolean | null
          review_note: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          road_address: string | null
          source_url: string | null
          updated_at: string
          verification_evidence: Json | null
        }
        Insert: {
          candidate_kind?: string | null
          category_code?: string | null
          category_group?: string | null
          category_group_code?: string | null
          category_group_name?: string | null
          category_name?: string | null
          content_type_id?: number | null
          created_at?: string
          district_code?: string | null
          district_name?: string | null
          expires_at?: string | null
          fetched_at?: string
          first_seen_at?: string
          id?: never
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          last_seen_run_id?: number | null
          lifecycle_status?: string | null
          location: unknown
          lot_address?: string | null
          name: string
          normalized_category?: string | null
          pending_publication_run_id?: number | null
          pet_evidence?: Json
          pet_evidence_status: string
          pet_notes?: string | null
          phone?: string | null
          provider: string
          provider_place_id: string
          provider_visibility?: string
          public_visibility?: boolean | null
          region_id: string
          requires_recheck?: boolean | null
          review_note?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          road_address?: string | null
          source_url?: string | null
          updated_at?: string
          verification_evidence?: Json | null
        }
        Update: {
          candidate_kind?: string | null
          category_code?: string | null
          category_group?: string | null
          category_group_code?: string | null
          category_group_name?: string | null
          category_name?: string | null
          content_type_id?: number | null
          created_at?: string
          district_code?: string | null
          district_name?: string | null
          expires_at?: string | null
          fetched_at?: string
          first_seen_at?: string
          id?: never
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          last_seen_run_id?: number | null
          lifecycle_status?: string | null
          location?: unknown
          lot_address?: string | null
          name?: string
          normalized_category?: string | null
          pending_publication_run_id?: number | null
          pet_evidence?: Json
          pet_evidence_status?: string
          pet_notes?: string | null
          phone?: string | null
          provider?: string
          provider_place_id?: string
          provider_visibility?: string
          public_visibility?: boolean | null
          region_id?: string
          requires_recheck?: boolean | null
          review_note?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          road_address?: string | null
          source_url?: string | null
          updated_at?: string
          verification_evidence?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "map_places_last_seen_run_fkey"
            columns: ["region_id", "last_seen_run_id"]
            isOneToOne: false
            referencedRelation: "map_ingest_runs"
            referencedColumns: ["region_id", "id"]
          },
          {
            foreignKeyName: "map_places_pending_publication_run_fkey"
            columns: ["region_id", "pending_publication_run_id"]
            isOneToOne: false
            referencedRelation: "map_ingest_runs"
            referencedColumns: ["region_id", "id"]
          },
          {
            foreignKeyName: "map_places_region_district_fkey"
            columns: ["region_id", "district_code", "district_name"]
            isOneToOne: false
            referencedRelation: "region_districts"
            referencedColumns: ["region_id", "district_code", "district_name"]
          },
          {
            foreignKeyName: "map_places_region_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["region_id"]
          },
        ]
      }
      region_districts: {
        Row: {
          created_at: string
          district_code: string
          district_name: string
          region_id: string
        }
        Insert: {
          created_at?: string
          district_code: string
          district_name: string
          region_id: string
        }
        Update: {
          created_at?: string
          district_code?: string
          district_name?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_districts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["region_id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          display_name: string
          kakao_collection_enabled: boolean
          legal_dong_code: string
          region_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          kakao_collection_enabled?: boolean
          legal_dong_code: string
          region_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          kakao_collection_enabled?: boolean
          legal_dong_code?: string
          region_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_kakao_catalog_query_v1: {
        Args: {
          p_accepted_result_count: number
          p_candidates: Json
          p_classification_rejection_count?: number
          p_completed_at?: string
          p_duplicate_result_count?: number
          p_invalid_coordinate_result_count?: number
          p_last_completed_page: number
          p_out_of_district_result_count?: number
          p_provider_429_count?: number
          p_provider_call_count: number
          p_provider_error_count?: number
          p_provider_result_count: number
          p_query_key: string
          p_rejected_result_count: number
          p_run_id: number
          p_run_provider_429_count?: number
          p_run_provider_call_count?: number
          p_run_provider_error_count?: number
          p_run_timeout_count?: number
          p_saturated?: boolean
          p_timeout_count?: number
        }
        Returns: {
          already_completed: boolean
          inserted_row_count: number
          preserved_review_row_count: number
          updated_row_count: number
        }[]
      }
      finalize_kakao_catalog_run_v1: {
        Args: {
          p_completed_at?: string
          p_run_id: number
          p_run_provider_429_count?: number
          p_run_provider_call_count?: number
          p_run_provider_error_count?: number
          p_run_timeout_count?: number
          p_sanitized_error_summary?: string
          p_status: string
        }
        Returns: {
          completed_query_count: number
          published_row_count: number
          run_status: string
          stale_row_count: number
          unique_place_count: number
        }[]
      }
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
          expires_at: string
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
          provider_visibility: string
          road_address: string
          source_url: string
        }[]
      }
      get_public_map_catalog_v1: {
        Args: {
          p_after_id?: number
          p_candidate_kinds?: string[]
          p_district_codes?: string[]
          p_east?: number
          p_normalized_categories?: string[]
          p_north?: number
          p_result_limit?: number
          p_south?: number
          p_west?: number
        }
        Returns: {
          address: string
          candidate_kind: string
          district_code: string
          district_name: string
          has_more: boolean
          id: number
          latitude: number
          longitude: number
          name: string
          normalized_category: string
          phone: string
          place_url: string
          provider_place_id: string
          public_label: string
          review_status: string
          source: string
          total_count: number
        }[]
      }
      get_public_map_catalog_v2: {
        Args: {
          p_after_id?: number
          p_candidate_kinds?: string[]
          p_district_codes?: string[]
          p_east?: number
          p_normalized_categories?: string[]
          p_north?: number
          p_result_limit?: number
          p_south?: number
          p_west?: number
        }
        Returns: {
          address: string
          candidate_kind: string
          category_group_code: string | null
          category_query_agreement_count: number
          district_code: string
          district_name: string
          has_more: boolean
          id: number
          last_seen_at: string
          latitude: number
          longitude: number
          matched_query_count: number
          name: string
          normalized_category: string
          phone: string | null
          place_url: string
          provider_place_id: string
          public_label: string
          review_status: string
          source: string
          total_count: number
        }[]
      }
      get_public_map_catalog_by_region_v1: {
        Args: {
          p_after_id?: number
          p_candidate_kinds?: string[]
          p_district_codes?: string[]
          p_east?: number
          p_normalized_categories?: string[]
          p_north?: number
          p_region_id: string
          p_result_limit?: number
          p_south?: number
          p_west?: number
        }
        Returns: {
          address: string
          candidate_kind: string
          category_group_code: string | null
          category_query_agreement_count: number
          district_code: string
          district_name: string
          has_more: boolean
          id: number
          last_seen_at: string
          latitude: number
          longitude: number
          matched_query_count: number
          name: string
          normalized_category: string
          phone: string | null
          place_url: string
          provider_place_id: string
          public_label: string
          review_status: string
          source: string
          total_count: number
        }[]
      }
      get_public_map_catalog_by_region_v2: {
        Args: {
          p_after_id?: number
          p_candidate_kinds?: string[]
          p_district_codes?: string[]
          p_normalized_categories?: string[]
          p_providers: string[]
          p_region_id: string
          p_result_limit?: number
        }
        Returns: {
          address: string
          candidate_kind: string
          category_group_code: string | null
          category_query_agreement_count: number
          content_type_id: number | null
          district_code: string
          district_name: string
          has_more: boolean
          id: number
          image_url: string | null
          last_seen_at: string
          latitude: number
          longitude: number
          matched_query_count: number
          name: string
          normalized_category: string
          pet_access_verdict: string
          pet_evidence_status: string
          phone: string | null
          place_url: string | null
          provider: string
          provider_place_id: string
          public_label: string
          review_status: string
          source: string
          total_count: number
        }[]
      }
      get_public_map_place_location_v1: {
        Args: { p_provider_place_id: string }
        Returns: {
          latitude: number
          longitude: number
          provider_place_id: string
        }[]
      }
      get_public_map_place_location_by_region_v1: {
        Args: { p_provider_place_id: string; p_region_id: string }
        Returns: {
          latitude: number
          longitude: number
          provider_place_id: string
        }[]
      }
      start_kakao_catalog_delta_run_v2: {
        Args: {
          p_collector_version: string
          p_is_full_catalog_run?: boolean
          p_queries: Json
          p_registry_version: string
          p_started_at?: string
        }
        Returns: {
          planned_query_count: number
          run_id: number
        }[]
      }
      start_kakao_catalog_run_v1: {
        Args: {
          p_collector_version: string
          p_is_full_catalog_run?: boolean
          p_queries: Json
          p_registry_version: string
          p_started_at?: string
        }
        Returns: {
          planned_query_count: number
          run_id: number
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
