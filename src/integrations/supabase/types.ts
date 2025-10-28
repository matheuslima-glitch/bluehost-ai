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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          position: number
          user_id: string
          widget_type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          position: number
          user_id: string
          widget_type: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          position?: number
          user_id?: string
          widget_type?: string
        }
        Relationships: []
      }
      domain_analytics: {
        Row: {
          bandwidth_gb: number | null
          created_at: string | null
          date: string
          domain_id: string
          id: string
          unique_visitors: number | null
          visits: number | null
        }
        Insert: {
          bandwidth_gb?: number | null
          created_at?: string | null
          date: string
          domain_id: string
          id?: string
          unique_visitors?: number | null
          visits?: number | null
        }
        Update: {
          bandwidth_gb?: number | null
          created_at?: string | null
          date?: string
          domain_id?: string
          id?: string
          unique_visitors?: number | null
          visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_analytics_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          auto_renew: boolean | null
          created_at: string | null
          dns_configured: boolean | null
          domain_name: string
          expiration_date: string | null
          id: string
          integration_source:
            | Database["public"]["Enums"]["integration_type"]
            | null
          monthly_visits: number | null
          nameservers: string[] | null
          platform: string | null
          propagation_ends_at: string | null
          purchase_date: string | null
          purchase_price: number | null
          purchased_by: string | null
          registrar: string | null
          ssl_status: string | null
          status: Database["public"]["Enums"]["domain_status"] | null
          structure_type: string | null
          traffic_source: string | null
          updated_at: string | null
          user_id: string
          zone_id: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string | null
          dns_configured?: boolean | null
          domain_name: string
          expiration_date?: string | null
          id?: string
          integration_source?:
            | Database["public"]["Enums"]["integration_type"]
            | null
          monthly_visits?: number | null
          nameservers?: string[] | null
          platform?: string | null
          propagation_ends_at?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchased_by?: string | null
          registrar?: string | null
          ssl_status?: string | null
          status?: Database["public"]["Enums"]["domain_status"] | null
          structure_type?: string | null
          traffic_source?: string | null
          updated_at?: string | null
          user_id: string
          zone_id?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string | null
          dns_configured?: boolean | null
          domain_name?: string
          expiration_date?: string | null
          id?: string
          integration_source?:
            | Database["public"]["Enums"]["integration_type"]
            | null
          monthly_visits?: number | null
          nameservers?: string[] | null
          platform?: string | null
          propagation_ends_at?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchased_by?: string | null
          registrar?: string | null
          ssl_status?: string | null
          status?: Database["public"]["Enums"]["domain_status"] | null
          structure_type?: string | null
          traffic_source?: string | null
          updated_at?: string | null
          user_id?: string
          zone_id?: string | null
        }
        Relationships: []
      }
      namecheap_balance: {
        Row: {
          balance_brl: number
          balance_usd: number
          created_at: string | null
          id: string
          last_synced_at: string | null
          user_id: string
        }
        Insert: {
          balance_brl?: number
          balance_usd?: number
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          user_id: string
        }
        Update: {
          balance_brl?: number
          balance_usd?: number
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
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
      domain_status: "active" | "expired" | "pending" | "suspended"
      integration_type: "namecheap" | "cloudflare" | "cpanel" | "godaddy"
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
      domain_status: ["active", "expired", "pending", "suspended"],
      integration_type: ["namecheap", "cloudflare", "cpanel", "godaddy"],
    },
  },
} as const
