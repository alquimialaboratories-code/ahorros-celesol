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
      admin_allowlist: {
        Row: {
          created_at: string
          dni: string
          email: string
        }
        Insert: {
          created_at?: string
          dni: string
          email: string
        }
        Update: {
          created_at?: string
          dni?: string
          email?: string
        }
        Relationships: []
      }
      configuracion_tasas: {
        Row: {
          clave: string
          updated_at: string
          valor: number
        }
        Insert: {
          clave: string
          updated_at?: string
          valor: number
        }
        Update: {
          clave?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          dni: string
          email: string
          id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          dni: string
          email: string
          id?: string
          tipo: string
        }
        Update: {
          created_at?: string
          dni?: string
          email?: string
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          dni: string
          email: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          code: string
          created_at?: string
          dni: string
          email: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          dni?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      otp_sessions: {
        Row: {
          created_at: string
          dni: string
          email: string
          expires_at: string
          id: string
          socio_id: string
          token: string
        }
        Insert: {
          created_at?: string
          dni: string
          email: string
          expires_at?: string
          id?: string
          socio_id: string
          token: string
        }
        Update: {
          created_at?: string
          dni?: string
          email?: string
          expires_at?: string
          id?: string
          socio_id?: string
          token?: string
        }
        Relationships: []
      }
      renovacion_solicitudes: {
        Row: {
          ahorro: Json | null
          created_at: string
          cuenta_id: string
          estado: string
          id: string
          opcion: string | null
          opcion_detalle: string | null
          solicitante_dni: string
          solicitante_email: string
          solicitante_nombre: string
          solicitante_socio_id: string
          titular_dni: string | null
          titular_nombre: string | null
        }
        Insert: {
          ahorro?: Json | null
          created_at?: string
          cuenta_id: string
          estado?: string
          id?: string
          opcion?: string | null
          opcion_detalle?: string | null
          solicitante_dni: string
          solicitante_email: string
          solicitante_nombre: string
          solicitante_socio_id: string
          titular_dni?: string | null
          titular_nombre?: string | null
        }
        Update: {
          ahorro?: Json | null
          created_at?: string
          cuenta_id?: string
          estado?: string
          id?: string
          opcion?: string | null
          opcion_detalle?: string | null
          solicitante_dni?: string
          solicitante_email?: string
          solicitante_nombre?: string
          solicitante_socio_id?: string
          titular_dni?: string | null
          titular_nombre?: string | null
        }
        Relationships: []
      }
      tasas_mercado_cache: {
        Row: {
          detalle: string | null
          fetched_at: string
          fuente_url: string | null
          id: string
          instrumento: string
          tna30: number | null
          tna60: number | null
        }
        Insert: {
          detalle?: string | null
          fetched_at?: string
          fuente_url?: string | null
          id?: string
          instrumento: string
          tna30?: number | null
          tna60?: number | null
        }
        Update: {
          detalle?: string | null
          fetched_at?: string
          fuente_url?: string | null
          id?: string
          instrumento?: string
          tna30?: number | null
          tna60?: number | null
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
