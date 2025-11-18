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
      cli_autorizados: {
        Row: {
          cedula: string | null
          created_at: string
          id_autorizado: string
          id_cliente: string | null
          nombre: string | null
        }
        Insert: {
          cedula?: string | null
          created_at?: string
          id_autorizado?: string
          id_cliente?: string | null
          nombre?: string | null
        }
        Update: {
          cedula?: string | null
          created_at?: string
          id_autorizado?: string
          id_cliente?: string | null
          nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cli_autorizados_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
        ]
      }
      cli_beneficiarios: {
        Row: {
          cedula: string | null
          contacto: string | null
          created_at: string
          id_beneficiario: string
          id_cliente: string | null
          nombre: string | null
        }
        Insert: {
          cedula?: string | null
          contacto?: string | null
          created_at?: string
          id_beneficiario?: string
          id_cliente?: string | null
          nombre?: string | null
        }
        Update: {
          cedula?: string | null
          contacto?: string | null
          created_at?: string
          id_beneficiario?: string
          id_cliente?: string | null
          nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cli_beneficiarios_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
        ]
      }
      clientes: {
        Row: {
          arrendamiento: number | null
          cedula: string | null
          correo: string | null
          created_at: string
          cuota_fija: number | null
          cuota_mes: number | null
          dia_pago: number | null
          direccion: string | null
          estado_civil: string | null
          fecha: string | null
          id_cliente: string
          jardin: string | null
          lote_numero: string | null
          metodo_pago: string | null
          nombre_completo: string
          numero_formulario: string | null
          plazo_arrendamiento: number | null
          precio: number | null
          prima: number | null
          producto: string | null
          profesion: string | null
          saldo: number | null
          telefono1: string | null
          telefono2: string | null
          tipo_cenizario: string | null
          tipo_cremacion: string | null
          tipo_lote: string | null
          tipo_paquetefunerario: string | null
          total_meses: number | null
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          arrendamiento?: number | null
          cedula?: string | null
          correo?: string | null
          created_at?: string
          cuota_fija?: number | null
          cuota_mes?: number | null
          dia_pago?: number | null
          direccion?: string | null
          estado_civil?: string | null
          fecha?: string | null
          id_cliente?: string
          jardin?: string | null
          lote_numero?: string | null
          metodo_pago?: string | null
          nombre_completo: string
          numero_formulario?: string | null
          plazo_arrendamiento?: number | null
          precio?: number | null
          prima?: number | null
          producto?: string | null
          profesion?: string | null
          saldo?: number | null
          telefono1?: string | null
          telefono2?: string | null
          tipo_cenizario?: string | null
          tipo_cremacion?: string | null
          tipo_lote?: string | null
          tipo_paquetefunerario?: string | null
          total_meses?: number | null
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          arrendamiento?: number | null
          cedula?: string | null
          correo?: string | null
          created_at?: string
          cuota_fija?: number | null
          cuota_mes?: number | null
          dia_pago?: number | null
          direccion?: string | null
          estado_civil?: string | null
          fecha?: string | null
          id_cliente?: string
          jardin?: string | null
          lote_numero?: string | null
          metodo_pago?: string | null
          nombre_completo?: string
          numero_formulario?: string | null
          plazo_arrendamiento?: number | null
          precio?: number | null
          prima?: number | null
          producto?: string | null
          profesion?: string | null
          saldo?: number | null
          telefono1?: string | null
          telefono2?: string | null
          tipo_cenizario?: string | null
          tipo_cremacion?: string | null
          tipo_lote?: string | null
          tipo_paquetefunerario?: string | null
          total_meses?: number | null
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      pre_autorizados: {
        Row: {
          cedula: string | null
          created_at: string
          id_autorizado: string
          id_precliente: string | null
          nombre: string | null
        }
        Insert: {
          cedula?: string | null
          created_at?: string
          id_autorizado?: string
          id_precliente?: string | null
          nombre?: string | null
        }
        Update: {
          cedula?: string | null
          created_at?: string
          id_autorizado?: string
          id_precliente?: string | null
          nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_autorizados_id_precliente_fkey"
            columns: ["id_precliente"]
            isOneToOne: false
            referencedRelation: "pre_clientes"
            referencedColumns: ["id_precliente"]
          },
        ]
      }
      pre_beneficiarios: {
        Row: {
          cedula: string | null
          contacto: string | null
          created_at: string
          id_beneficiario: string
          id_precliente: string | null
          nombre: string | null
        }
        Insert: {
          cedula?: string | null
          contacto?: string | null
          created_at?: string
          id_beneficiario?: string
          id_precliente?: string | null
          nombre?: string | null
        }
        Update: {
          cedula?: string | null
          contacto?: string | null
          created_at?: string
          id_beneficiario?: string
          id_precliente?: string | null
          nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_beneficiarios_id_precliente_fkey"
            columns: ["id_precliente"]
            isOneToOne: false
            referencedRelation: "pre_clientes"
            referencedColumns: ["id_precliente"]
          },
        ]
      }
      pre_clientes: {
        Row: {
          correo: string | null
          created_at: string
          cuota_fija: number | null
          dia_pago: number | null
          direccion: string | null
          estado_civil: string | null
          fecha: string | null
          id_precliente: string
          identificacion: string | null
          lote_numero: string | null
          metodo_pago: string | null
          nombre_completo: string
          numero_formulario: string | null
          precio: number | null
          prima: number | null
          producto: string | null
          profesion: string | null
          saldo: number | null
          telefono1: string | null
          telefono2: string | null
          total_meses: number | null
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          correo?: string | null
          created_at?: string
          cuota_fija?: number | null
          dia_pago?: number | null
          direccion?: string | null
          estado_civil?: string | null
          fecha?: string | null
          id_precliente?: string
          identificacion?: string | null
          lote_numero?: string | null
          metodo_pago?: string | null
          nombre_completo: string
          numero_formulario?: string | null
          precio?: number | null
          prima?: number | null
          producto?: string | null
          profesion?: string | null
          saldo?: number | null
          telefono1?: string | null
          telefono2?: string | null
          total_meses?: number | null
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          correo?: string | null
          created_at?: string
          cuota_fija?: number | null
          dia_pago?: number | null
          direccion?: string | null
          estado_civil?: string | null
          fecha?: string | null
          id_precliente?: string
          identificacion?: string | null
          lote_numero?: string | null
          metodo_pago?: string | null
          nombre_completo?: string
          numero_formulario?: string | null
          precio?: number | null
          prima?: number | null
          producto?: string | null
          profesion?: string | null
          saldo?: number | null
          telefono1?: string | null
          telefono2?: string | null
          total_meses?: number | null
          updated_at?: string
          vendedor?: string | null
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
