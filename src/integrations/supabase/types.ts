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
      cliente: {
        Row: {
          cedula: string | null
          direccion: string | null
          email: string | null
          estado_civil: string | null
          id_cliente: number
          nombre_completo: string
          observaciones: string | null
          profesion: string | null
          telefono1: string | null
          telefono2: string | null
        }
        Insert: {
          cedula?: string | null
          direccion?: string | null
          email?: string | null
          estado_civil?: string | null
          id_cliente?: number
          nombre_completo: string
          observaciones?: string | null
          profesion?: string | null
          telefono1?: string | null
          telefono2?: string | null
        }
        Update: {
          cedula?: string | null
          direccion?: string | null
          email?: string | null
          estado_civil?: string | null
          id_cliente?: number
          nombre_completo?: string
          observaciones?: string | null
          profesion?: string | null
          telefono1?: string | null
          telefono2?: string | null
        }
        Relationships: []
      }
      contrato: {
        Row: {
          anio_inicio_mantenimiento: number | null
          cantidad_lotes: number | null
          cuota_mensual: number | null
          dia_pago_mensual: number | null
          estado_contrato: Database["public"]["Enums"]["estado_contrato_enum"]
          fecha_anulacion: string | null
          fecha_firma: string | null
          fecha_inicio_mantenimiento: string | null
          fecha_primera_cuota: string | null
          id_cliente: number
          id_contrato: number
          id_vendedor: number
          monto_apertura: number | null
          monto_arrendamiento_total: number | null
          monto_entregado_inicial: number | null
          monto_mantenimiento_anual: number | null
          numero_contrato: string
          numero_formulario: string | null
          observaciones_contrato: string | null
          onedrive_anulacion_actualizado_en: string | null
          onedrive_anulacion_error: string | null
          onedrive_anulacion_estado: string | null
          onedrive_carpeta_id: string | null
          onedrive_carpeta_nombre: string | null
          onedrive_carpeta_url: string | null
          onedrive_categoria_ruta: string | null
          onedrive_validacion_actualizado_en: string | null
          onedrive_validacion_error: string | null
          onedrive_validacion_estado: string | null
          plazo_anios: number | null
          saldo_pendiente: number | null
          tasa_interes_anual: number | null
          total_meses: number | null
          usuario_anulacion: string | null
        }
        Insert: {
          anio_inicio_mantenimiento?: number | null
          cantidad_lotes?: number | null
          cuota_mensual?: number | null
          dia_pago_mensual?: number | null
          estado_contrato?: Database["public"]["Enums"]["estado_contrato_enum"]
          fecha_anulacion?: string | null
          fecha_firma?: string | null
          fecha_inicio_mantenimiento?: string | null
          fecha_primera_cuota?: string | null
          id_cliente: number
          id_contrato?: number
          id_vendedor: number
          monto_apertura?: number | null
          monto_arrendamiento_total?: number | null
          monto_entregado_inicial?: number | null
          monto_mantenimiento_anual?: number | null
          numero_contrato: string
          numero_formulario?: string | null
          observaciones_contrato?: string | null
          onedrive_anulacion_actualizado_en?: string | null
          onedrive_anulacion_error?: string | null
          onedrive_anulacion_estado?: string | null
          onedrive_carpeta_id?: string | null
          onedrive_carpeta_nombre?: string | null
          onedrive_carpeta_url?: string | null
          onedrive_categoria_ruta?: string | null
          onedrive_validacion_actualizado_en?: string | null
          onedrive_validacion_error?: string | null
          onedrive_validacion_estado?: string | null
          plazo_anios?: number | null
          saldo_pendiente?: number | null
          tasa_interes_anual?: number | null
          total_meses?: number | null
          usuario_anulacion?: string | null
        }
        Update: {
          anio_inicio_mantenimiento?: number | null
          cantidad_lotes?: number | null
          cuota_mensual?: number | null
          dia_pago_mensual?: number | null
          estado_contrato?: Database["public"]["Enums"]["estado_contrato_enum"]
          fecha_anulacion?: string | null
          fecha_firma?: string | null
          fecha_inicio_mantenimiento?: string | null
          fecha_primera_cuota?: string | null
          id_cliente?: number
          id_contrato?: number
          id_vendedor?: number
          monto_apertura?: number | null
          monto_arrendamiento_total?: number | null
          monto_entregado_inicial?: number | null
          monto_mantenimiento_anual?: number | null
          numero_contrato?: string
          numero_formulario?: string | null
          observaciones_contrato?: string | null
          onedrive_anulacion_actualizado_en?: string | null
          onedrive_anulacion_error?: string | null
          onedrive_anulacion_estado?: string | null
          onedrive_carpeta_id?: string | null
          onedrive_carpeta_nombre?: string | null
          onedrive_carpeta_url?: string | null
          onedrive_categoria_ruta?: string | null
          onedrive_validacion_actualizado_en?: string | null
          onedrive_validacion_error?: string | null
          onedrive_validacion_estado?: string | null
          plazo_anios?: number | null
          saldo_pendiente?: number | null
          tasa_interes_anual?: number | null
          total_meses?: number | null
          usuario_anulacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_contrato_cliente"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id_cliente"]
          },
          {
            foreignKeyName: "fk_contrato_vendedor"
            columns: ["id_vendedor"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id_vendedor"]
          },
        ]
      }
      contrato_anulacion_log: {
        Row: {
          detalle: string | null
          fecha: string
          id_contrato: number
          id_log: number
          onedrive_error: string | null
          onedrive_estado: string | null
          resultado: string
          usuario: string | null
        }
        Insert: {
          detalle?: string | null
          fecha?: string
          id_contrato: number
          id_log?: number
          onedrive_error?: string | null
          onedrive_estado?: string | null
          resultado: string
          usuario?: string | null
        }
        Update: {
          detalle?: string | null
          fecha?: string
          id_contrato?: number
          id_log?: number
          onedrive_error?: string | null
          onedrive_estado?: string | null
          resultado?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_anulacion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_anulacion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_anulacion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_anulacion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_anulacion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_autorizados: {
        Row: {
          cedula: string | null
          id_contrato: number
          id_contrato_autorizado: number
          nombre: string
        }
        Insert: {
          cedula?: string | null
          id_contrato: number
          id_contrato_autorizado?: number
          nombre: string
        }
        Update: {
          cedula?: string | null
          id_contrato?: number
          id_contrato_autorizado?: number
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_contrato_autorizado_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_autorizado_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_autorizado_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_autorizado_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_autorizado_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_beneficiarios: {
        Row: {
          cedula: string | null
          contacto: string | null
          id_contrato: number
          id_contrato_beneficiario: number
          nombre: string
        }
        Insert: {
          cedula?: string | null
          contacto?: string | null
          id_contrato: number
          id_contrato_beneficiario?: number
          nombre: string
        }
        Update: {
          cedula?: string | null
          contacto?: string | null
          id_contrato?: number
          id_contrato_beneficiario?: number
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_contrato_beneficiario_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_beneficiario_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_beneficiario_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_beneficiario_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_beneficiario_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_cargo: {
        Row: {
          descripcion: string | null
          estado: string
          fecha_vencimiento: string | null
          id_cargo: number
          id_contrato: number
          id_plan_pago: number | null
          monto_original: number
          monto_pagado: number
          notas: string | null
          tipo_cargo: string
        }
        Insert: {
          descripcion?: string | null
          estado?: string
          fecha_vencimiento?: string | null
          id_cargo?: number
          id_contrato: number
          id_plan_pago?: number | null
          monto_original: number
          monto_pagado?: number
          notas?: string | null
          tipo_cargo: string
        }
        Update: {
          descripcion?: string | null
          estado?: string
          fecha_vencimiento?: string | null
          id_cargo?: number
          id_contrato?: number
          id_plan_pago?: number | null
          monto_original?: number
          monto_pagado?: number
          notas?: string | null
          tipo_cargo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_cargo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_cargo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_cargo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_cargo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_cargo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_cargo_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_cargo_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_cargo_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_cuota: {
        Row: {
          capital_amortizado_acumulado: number
          estado: string
          fecha_ultimo_pago: string | null
          fecha_vencimiento: string
          id_cuota: number
          id_plan_pago: number
          monto_ajuste_programado: number
          monto_capital_programado: number
          monto_cuota_base: number
          monto_cuota_total_programada: number
          monto_interes_programado: number
          monto_pagado_capital: number
          monto_pagado_interes: number
          monto_pagado_total: number
          notas: string | null
          numero_cuota: number
          numero_factura: string | null
          saldo_final_programado: number
          saldo_inicial: number
        }
        Insert: {
          capital_amortizado_acumulado?: number
          estado?: string
          fecha_ultimo_pago?: string | null
          fecha_vencimiento: string
          id_cuota?: number
          id_plan_pago: number
          monto_ajuste_programado?: number
          monto_capital_programado: number
          monto_cuota_base: number
          monto_cuota_total_programada: number
          monto_interes_programado: number
          monto_pagado_capital?: number
          monto_pagado_interes?: number
          monto_pagado_total?: number
          notas?: string | null
          numero_cuota: number
          numero_factura?: string | null
          saldo_final_programado: number
          saldo_inicial: number
        }
        Update: {
          capital_amortizado_acumulado?: number
          estado?: string
          fecha_ultimo_pago?: string | null
          fecha_vencimiento?: string
          id_cuota?: number
          id_plan_pago?: number
          monto_ajuste_programado?: number
          monto_capital_programado?: number
          monto_cuota_base?: number
          monto_cuota_total_programada?: number
          monto_interes_programado?: number
          monto_pagado_capital?: number
          monto_pagado_interes?: number
          monto_pagado_total?: number
          notas?: string | null
          numero_cuota?: number
          numero_factura?: string | null
          saldo_final_programado?: number
          saldo_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_cuota_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_cuota_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_cuota_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_edicion_log: {
        Row: {
          cambios: Json
          fecha: string
          id_contrato: number
          id_log: number
          resumen: string
          usuario: string | null
        }
        Insert: {
          cambios: Json
          fecha?: string
          id_contrato: number
          id_log?: number
          resumen: string
          usuario?: string | null
        }
        Update: {
          cambios?: Json
          fecha?: string
          id_contrato?: number
          id_log?: number
          resumen?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_edicion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_edicion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_edicion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_edicion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_edicion_log_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_evento_financiero: {
        Row: {
          fecha_evento: string
          id_contrato: number
          id_evento: number
          id_plan_origen: number | null
          id_plan_resultante: number | null
          observacion: string | null
          payload: Json
          tipo_evento: string
          usuario: string | null
        }
        Insert: {
          fecha_evento?: string
          id_contrato: number
          id_evento?: number
          id_plan_origen?: number | null
          id_plan_resultante?: number | null
          observacion?: string | null
          payload?: Json
          tipo_evento: string
          usuario?: string | null
        }
        Update: {
          fecha_evento?: string
          id_contrato?: number
          id_evento?: number
          id_plan_origen?: number | null
          id_plan_resultante?: number | null
          observacion?: string | null
          payload?: Json
          tipo_evento?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_evento_financiero_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_plan_origen_fkey"
            columns: ["id_plan_origen"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_plan_origen_fkey"
            columns: ["id_plan_origen"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_plan_origen_fkey"
            columns: ["id_plan_origen"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_plan_resultante_fkey"
            columns: ["id_plan_resultante"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_plan_resultante_fkey"
            columns: ["id_plan_resultante"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_evento_financiero_id_plan_resultante_fkey"
            columns: ["id_plan_resultante"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_interes_moratorio_calculo: {
        Row: {
          anulado_at: string | null
          anulado_por: string | null
          base_cuotas_vencidas: number
          base_mora_anterior: number
          base_total: number
          created_at: string
          detalle_cuotas: Json
          dias_gracia: number
          estado: string
          fecha_corte: string
          id_calculo_mora: number
          id_cargo: number | null
          id_contrato: number
          id_plan_pago: number
          monto_generado: number
          motivo_anulacion: string | null
          periodo_mora: string
          tasa_mensual: number
          usuario_creacion: string | null
        }
        Insert: {
          anulado_at?: string | null
          anulado_por?: string | null
          base_cuotas_vencidas?: number
          base_mora_anterior?: number
          base_total?: number
          created_at?: string
          detalle_cuotas?: Json
          dias_gracia: number
          estado?: string
          fecha_corte: string
          id_calculo_mora?: number
          id_cargo?: number | null
          id_contrato: number
          id_plan_pago: number
          monto_generado?: number
          motivo_anulacion?: string | null
          periodo_mora: string
          tasa_mensual: number
          usuario_creacion?: string | null
        }
        Update: {
          anulado_at?: string | null
          anulado_por?: string | null
          base_cuotas_vencidas?: number
          base_mora_anterior?: number
          base_total?: number
          created_at?: string
          detalle_cuotas?: Json
          dias_gracia?: number
          estado?: string
          fecha_corte?: string
          id_calculo_mora?: number
          id_cargo?: number | null
          id_contrato?: number
          id_plan_pago?: number
          monto_generado?: number
          motivo_anulacion?: string | null
          periodo_mora?: string
          tasa_mensual?: number
          usuario_creacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_interes_moratorio_calculo_id_cargo_fkey"
            columns: ["id_cargo"]
            isOneToOne: true
            referencedRelation: "contrato_cargo"
            referencedColumns: ["id_cargo"]
          },
          {
            foreignKeyName: "contrato_interes_moratorio_calculo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_interes_moratorio_calculo_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_interes_moratorio_configuracion: {
        Row: {
          activo: boolean
          created_at: string
          dias_gracia: number
          fecha_efectiva: string
          id_configuracion: number
          tasa_mensual: number
          updated_at: string
          usuario_actualizacion: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dias_gracia?: number
          fecha_efectiva: string
          id_configuracion?: number
          tasa_mensual?: number
          updated_at?: string
          usuario_actualizacion?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          dias_gracia?: number
          fecha_efectiva?: string
          id_configuracion?: number
          tasa_mensual?: number
          updated_at?: string
          usuario_actualizacion?: string | null
        }
        Relationships: []
      }
      contrato_mantenimiento_interes_moratorio_configuracion: {
        Row: {
          activo: boolean
          created_at: string
          fecha_efectiva: string
          id_configuracion: number
          tasa_mensual: number
          updated_at: string
          usuario_actualizacion: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          fecha_efectiva: string
          id_configuracion?: number
          tasa_mensual?: number
          updated_at?: string
          usuario_actualizacion?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          fecha_efectiva?: string
          id_configuracion?: number
          tasa_mensual?: number
          updated_at?: string
          usuario_actualizacion?: string | null
        }
        Relationships: []
      }
      contrato_mantenimiento_cuota: {
        Row: {
          created_at: string
          estado: string
          fecha_fin_periodo: string
          fecha_inicio_periodo: string
          fecha_ultimo_pago: string | null
          fecha_vencimiento: string
          id_contrato: number
          id_cuota_mantenimiento: number
          monto_pagado: number
          monto_programado: number
          notas: string | null
          numero_periodo: number
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha_fin_periodo: string
          fecha_inicio_periodo: string
          fecha_ultimo_pago?: string | null
          fecha_vencimiento: string
          id_contrato: number
          id_cuota_mantenimiento?: number
          monto_pagado?: number
          monto_programado: number
          notas?: string | null
          numero_periodo: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_fin_periodo?: string
          fecha_inicio_periodo?: string
          fecha_ultimo_pago?: string | null
          fecha_vencimiento?: string
          id_contrato?: number
          id_cuota_mantenimiento?: number
          monto_pagado?: number
          monto_programado?: number
          notas?: string | null
          numero_periodo?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mantenimiento_cuota_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_cuota_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_cuota_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_cuota_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_cuota_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_mantenimiento_cargo: {
        Row: {
          created_at: string
          descripcion: string
          estado: string
          fecha_corte: string
          fecha_vencimiento: string
          id_cargo_mantenimiento: number
          id_contrato: number
          id_cuota_mantenimiento: number
          monto_original: number
          monto_pagado: number
          notas: string | null
          tipo_cargo: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          estado?: string
          fecha_corte: string
          fecha_vencimiento: string
          id_cargo_mantenimiento?: number
          id_contrato: number
          id_cuota_mantenimiento: number
          monto_original: number
          monto_pagado?: number
          notas?: string | null
          tipo_cargo: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          estado?: string
          fecha_corte?: string
          fecha_vencimiento?: string
          id_cargo_mantenimiento?: number
          id_contrato?: number
          id_cuota_mantenimiento?: number
          monto_original?: number
          monto_pagado?: number
          notas?: string | null
          tipo_cargo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mantenimiento_cargo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_cargo_id_cuota_mantenimiento_fkey"
            columns: ["id_cuota_mantenimiento"]
            isOneToOne: false
            referencedRelation: "contrato_mantenimiento_cuota"
            referencedColumns: ["id_cuota_mantenimiento"]
          },
        ]
      }
      contrato_mantenimiento_interes_moratorio_calculo: {
        Row: {
          anulado_at: string | null
          anulado_por: string | null
          base_principal_pendiente: number
          created_at: string
          detalle_principal: Json
          estado: string
          fecha_corte: string
          id_calculo_mora_mantenimiento: number
          id_cargo_mantenimiento: number | null
          id_contrato: number
          id_cuota_mantenimiento: number
          monto_generado: number
          motivo_anulacion: string | null
          periodo_mora: string
          tasa_mensual: number
          usuario_creacion: string | null
        }
        Insert: {
          anulado_at?: string | null
          anulado_por?: string | null
          base_principal_pendiente: number
          created_at?: string
          detalle_principal?: Json
          estado?: string
          fecha_corte: string
          id_calculo_mora_mantenimiento?: number
          id_cargo_mantenimiento?: number | null
          id_contrato: number
          id_cuota_mantenimiento: number
          monto_generado: number
          motivo_anulacion?: string | null
          periodo_mora: string
          tasa_mensual: number
          usuario_creacion?: string | null
        }
        Update: {
          anulado_at?: string | null
          anulado_por?: string | null
          base_principal_pendiente?: number
          created_at?: string
          detalle_principal?: Json
          estado?: string
          fecha_corte?: string
          id_calculo_mora_mantenimiento?: number
          id_cargo_mantenimiento?: number | null
          id_contrato?: number
          id_cuota_mantenimiento?: number
          monto_generado?: number
          motivo_anulacion?: string | null
          periodo_mora?: string
          tasa_mensual?: number
          usuario_creacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mantenimiento_interes_moratorio_calculo_id_cargo_fkey"
            columns: ["id_cargo_mantenimiento"]
            isOneToOne: true
            referencedRelation: "contrato_mantenimiento_cargo"
            referencedColumns: ["id_cargo_mantenimiento"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_interes_moratorio_calculo_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_interes_moratorio_calculo_id_cuota_fkey"
            columns: ["id_cuota_mantenimiento"]
            isOneToOne: false
            referencedRelation: "contrato_mantenimiento_cuota"
            referencedColumns: ["id_cuota_mantenimiento"]
          },
        ]
      }
      contrato_mantenimiento_pago: {
        Row: {
          created_at: string
          estado: string
          fecha_pago: string
          id_contrato: number
          id_pago_mantenimiento: number
          idempotency_key: string | null
          metodo_pago: string | null
          monto_total: number
          observacion: string | null
          referencia: string | null
          registrado_por: string | null
          tipo_pago: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha_pago: string
          id_contrato: number
          id_pago_mantenimiento?: number
          idempotency_key?: string | null
          metodo_pago?: string | null
          monto_total: number
          observacion?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tipo_pago?: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_pago?: string
          id_contrato?: number
          id_pago_mantenimiento?: number
          idempotency_key?: string | null
          metodo_pago?: string | null
          monto_total?: number
          observacion?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tipo_pago?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mantenimiento_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_mantenimiento_pago_aplicacion: {
        Row: {
          id_aplicacion_mantenimiento: number
          id_cargo_mantenimiento: number | null
          id_cuota_mantenimiento: number | null
          id_pago_mantenimiento: number
          monto_aplicado: number
          notas: string | null
        }
        Insert: {
          id_aplicacion_mantenimiento?: number
          id_cargo_mantenimiento?: number | null
          id_cuota_mantenimiento?: number | null
          id_pago_mantenimiento: number
          monto_aplicado: number
          notas?: string | null
        }
        Update: {
          id_aplicacion_mantenimiento?: number
          id_cargo_mantenimiento?: number | null
          id_cuota_mantenimiento?: number | null
          id_pago_mantenimiento?: number
          monto_aplicado?: number
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mantenimiento_pago_aplicac_id_cargo_mantenimiento_fkey"
            columns: ["id_cargo_mantenimiento"]
            isOneToOne: false
            referencedRelation: "contrato_mantenimiento_cargo"
            referencedColumns: ["id_cargo_mantenimiento"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_aplicac_id_cuota_mantenimiento_fkey"
            columns: ["id_cuota_mantenimiento"]
            isOneToOne: false
            referencedRelation: "contrato_mantenimiento_cuota"
            referencedColumns: ["id_cuota_mantenimiento"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_aplicac_id_cuota_mantenimiento_fkey"
            columns: ["id_cuota_mantenimiento"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_cuota_mantenimiento"]
          },
          {
            foreignKeyName: "contrato_mantenimiento_pago_aplicaci_id_pago_mantenimiento_fkey"
            columns: ["id_pago_mantenimiento"]
            isOneToOne: false
            referencedRelation: "contrato_mantenimiento_pago"
            referencedColumns: ["id_pago_mantenimiento"]
          },
        ]
      }
      contrato_pago: {
        Row: {
          anulado_at: string | null
          anulado_por: string | null
          created_at: string
          estado: string
          fecha_pago: string
          id_contrato: number
          idempotency_key: string | null
          id_pago: number
          metodo_pago: string | null
          monto_total: number
          motivo_anulacion: string | null
          numero_factura: string | null
          observacion: string | null
          referencia: string | null
          registrado_por: string | null
          tipo_pago: string
        }
        Insert: {
          anulado_at?: string | null
          anulado_por?: string | null
          created_at?: string
          estado?: string
          fecha_pago: string
          id_contrato: number
          idempotency_key?: string | null
          id_pago?: number
          metodo_pago?: string | null
          monto_total: number
          motivo_anulacion?: string | null
          numero_factura?: string | null
          observacion?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tipo_pago?: string
        }
        Update: {
          anulado_at?: string | null
          anulado_por?: string | null
          created_at?: string
          estado?: string
          fecha_pago?: string
          id_contrato?: number
          idempotency_key?: string | null
          id_pago?: number
          metodo_pago?: string | null
          monto_total?: number
          motivo_anulacion?: string | null
          numero_factura?: string | null
          observacion?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tipo_pago?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
        ]
      }
      contrato_pago_extraordinario: {
        Row: {
          ahorro_intereses: number
          created_at: string
          cuota_base: number
          cuotas_restantes_antes: number
          cuotas_restantes_despues: number
          fecha_fin_antes: string | null
          fecha_fin_despues: string | null
          fecha_pago: string
          id_contrato: number
          id_pago: number
          id_plan_origen: number
          id_plan_resultante: number
          interes_futuro_antes: number
          interes_futuro_despues: number
          liquidacion_total: boolean
          monto_extraordinario: number
          registrado_por: string | null
          saldo_capital_antes: number
          saldo_capital_despues: number
          tasa_interes_anual: number
          tasa_interes_mensual: number
        }
        Insert: {
          ahorro_intereses: number
          created_at?: string
          cuota_base: number
          cuotas_restantes_antes: number
          cuotas_restantes_despues: number
          fecha_fin_antes?: string | null
          fecha_fin_despues?: string | null
          fecha_pago: string
          id_contrato: number
          id_pago: number
          id_plan_origen: number
          id_plan_resultante: number
          interes_futuro_antes: number
          interes_futuro_despues: number
          liquidacion_total?: boolean
          monto_extraordinario: number
          registrado_por?: string | null
          saldo_capital_antes: number
          saldo_capital_despues: number
          tasa_interes_anual: number
          tasa_interes_mensual: number
        }
        Update: {
          ahorro_intereses?: number
          created_at?: string
          cuota_base?: number
          cuotas_restantes_antes?: number
          cuotas_restantes_despues?: number
          fecha_fin_antes?: string | null
          fecha_fin_despues?: string | null
          fecha_pago?: string
          id_contrato?: number
          id_pago?: number
          id_plan_origen?: number
          id_plan_resultante?: number
          interes_futuro_antes?: number
          interes_futuro_despues?: number
          liquidacion_total?: boolean
          monto_extraordinario?: number
          registrado_por?: string | null
          saldo_capital_antes?: number
          saldo_capital_despues?: number
          tasa_interes_anual?: number
          tasa_interes_mensual?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_pago_extraordinario_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_pago_extraordinario_id_pago_fkey"
            columns: ["id_pago"]
            isOneToOne: true
            referencedRelation: "contrato_pago"
            referencedColumns: ["id_pago"]
          },
          {
            foreignKeyName: "contrato_pago_extraordinario_id_plan_origen_fkey"
            columns: ["id_plan_origen"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_pago_extraordinario_id_plan_resultante_fkey"
            columns: ["id_plan_resultante"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_pago_aplicacion: {
        Row: {
          id_aplicacion: number
          id_cargo: number | null
          id_cuota: number | null
          id_pago: number
          id_plan_pago: number | null
          monto_capital: number
          monto_interes: number
          monto_otros: number
          notas: string | null
        }
        Insert: {
          id_aplicacion?: number
          id_cargo?: number | null
          id_cuota?: number | null
          id_pago: number
          id_plan_pago?: number | null
          monto_capital?: number
          monto_interes?: number
          monto_otros?: number
          notas?: string | null
        }
        Update: {
          id_aplicacion?: number
          id_cargo?: number | null
          id_cuota?: number | null
          id_pago?: number
          id_plan_pago?: number | null
          monto_capital?: number
          monto_interes?: number
          monto_otros?: number
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_pago_aplicacion_id_cargo_fkey"
            columns: ["id_cargo"]
            isOneToOne: false
            referencedRelation: "contrato_cargo"
            referencedColumns: ["id_cargo"]
          },
          {
            foreignKeyName: "contrato_pago_aplicacion_id_cuota_fkey"
            columns: ["id_cuota"]
            isOneToOne: false
            referencedRelation: "contrato_cuota"
            referencedColumns: ["id_cuota"]
          },
          {
            foreignKeyName: "contrato_pago_aplicacion_id_cuota_fkey"
            columns: ["id_cuota"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_cuota"]
          },
          {
            foreignKeyName: "contrato_pago_aplicacion_id_pago_fkey"
            columns: ["id_pago"]
            isOneToOne: false
            referencedRelation: "contrato_pago"
            referencedColumns: ["id_pago"]
          },
          {
            foreignKeyName: "contrato_pago_aplicacion_id_plan_pago_fkey"
            columns: ["id_plan_pago"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_plan_pago: {
        Row: {
          cuota_base: number
          dia_pago_mensual: number
          estado: string
          fecha_efectiva: string
          fecha_generacion: string
          fecha_primera_cuota: string
          id_contrato: number
          id_plan_anterior: number | null
          id_plan_pago: number
          monto_prima: number
          monto_principal: number
          observaciones: string | null
          plazo_meses: number
          saldo_inicial: number
          tasa_interes_anual: number
          tasa_interes_mensual: number
          tipo_plan: string
          usuario_creacion: string | null
          version: number
        }
        Insert: {
          cuota_base: number
          dia_pago_mensual: number
          estado?: string
          fecha_efectiva: string
          fecha_generacion?: string
          fecha_primera_cuota: string
          id_contrato: number
          id_plan_anterior?: number | null
          id_plan_pago?: number
          monto_prima?: number
          monto_principal: number
          observaciones?: string | null
          plazo_meses: number
          saldo_inicial: number
          tasa_interes_anual: number
          tasa_interes_mensual: number
          tipo_plan?: string
          usuario_creacion?: string | null
          version: number
        }
        Update: {
          cuota_base?: number
          dia_pago_mensual?: number
          estado?: string
          fecha_efectiva?: string
          fecha_generacion?: string
          fecha_primera_cuota?: string
          id_contrato?: number
          id_plan_anterior?: number | null
          id_plan_pago?: number
          monto_prima?: number
          monto_principal?: number
          observaciones?: string | null
          plazo_meses?: number
          saldo_inicial?: number
          tasa_interes_anual?: number
          tasa_interes_mensual?: number
          tipo_plan?: string
          usuario_creacion?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_plan_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_contrato_fkey"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_plan_anterior_fkey"
            columns: ["id_plan_anterior"]
            isOneToOne: false
            referencedRelation: "contrato_plan_pago"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_plan_anterior_fkey"
            columns: ["id_plan_anterior"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_plan_pago"]
          },
          {
            foreignKeyName: "contrato_plan_pago_id_plan_anterior_fkey"
            columns: ["id_plan_anterior"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_plan_pago"]
          },
        ]
      }
      contrato_producto: {
        Row: {
          cantidad: number | null
          id_contrato: number
          id_contrato_producto: number
          id_lote: number | null
          id_paquete: number | null
          id_tipo_cenizario: number | null
          id_tipo_cremacion: number | null
          precio: number | null
          tipo_producto: Database["public"]["Enums"]["tipo_producto_enum"]
        }
        Insert: {
          cantidad?: number | null
          id_contrato: number
          id_contrato_producto?: number
          id_lote?: number | null
          id_paquete?: number | null
          id_tipo_cenizario?: number | null
          id_tipo_cremacion?: number | null
          precio?: number | null
          tipo_producto: Database["public"]["Enums"]["tipo_producto_enum"]
        }
        Update: {
          cantidad?: number | null
          id_contrato?: number
          id_contrato_producto?: number
          id_lote?: number | null
          id_paquete?: number | null
          id_tipo_cenizario?: number | null
          id_tipo_cremacion?: number | null
          precio?: number | null
          tipo_producto?: Database["public"]["Enums"]["tipo_producto_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_contrato_producto_cenizario"
            columns: ["id_tipo_cenizario"]
            isOneToOne: false
            referencedRelation: "tipo_cenizario"
            referencedColumns: ["id_tipo_cenizario"]
          },
          {
            foreignKeyName: "fk_contrato_producto_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "contrato"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_producto_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_plan_vigente"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_producto_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_cuotas_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_producto_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_cuotas"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_producto_contrato"
            columns: ["id_contrato"]
            isOneToOne: false
            referencedRelation: "vw_control_mantenimiento_resumen"
            referencedColumns: ["id_contrato"]
          },
          {
            foreignKeyName: "fk_contrato_producto_cremacion"
            columns: ["id_tipo_cremacion"]
            isOneToOne: false
            referencedRelation: "tipo_cremacion"
            referencedColumns: ["id_tipo_cremacion"]
          },
          {
            foreignKeyName: "fk_contrato_producto_lote"
            columns: ["id_lote"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id_lote"]
          },
          {
            foreignKeyName: "fk_contrato_producto_paquete"
            columns: ["id_paquete"]
            isOneToOne: false
            referencedRelation: "paquete_funerario"
            referencedColumns: ["id_paquete"]
          },
        ]
      }
      jardin: {
        Row: {
          filas_lote: number
          id_jardin: number
          nombre: string
        }
        Insert: {
          filas_lote?: number
          id_jardin?: number
          nombre: string
        }
        Update: {
          filas_lote?: number
          id_jardin?: number
          nombre?: string
        }
        Relationships: []
      }
      lote: {
        Row: {
          id_jardin: number
          id_lote: number
          id_tipo_lote: number
          numero_lote: string
        }
        Insert: {
          id_jardin: number
          id_lote?: number
          id_tipo_lote: number
          numero_lote: string
        }
        Update: {
          id_jardin?: number
          id_lote?: number
          id_tipo_lote?: number
          numero_lote?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_lote_jardin"
            columns: ["id_jardin"]
            isOneToOne: false
            referencedRelation: "jardin"
            referencedColumns: ["id_jardin"]
          },
          {
            foreignKeyName: "fk_lote_tipo_lote"
            columns: ["id_tipo_lote"]
            isOneToOne: false
            referencedRelation: "tipo_lote"
            referencedColumns: ["id_tipo_lote"]
          },
        ]
      }
      lote_espacio: {
        Row: {
          estado: string
          fecha_ocupacion: string | null
          id_contrato_producto: number | null
          id_lote: number
          id_lote_espacio: number
          nombre_ocupante: string | null
          numero_espacio: number
        }
        Insert: {
          estado?: string
          fecha_ocupacion?: string | null
          id_contrato_producto?: number | null
          id_lote: number
          id_lote_espacio?: number
          nombre_ocupante?: string | null
          numero_espacio: number
        }
        Update: {
          estado?: string
          fecha_ocupacion?: string | null
          id_contrato_producto?: number | null
          id_lote?: number
          id_lote_espacio?: number
          nombre_ocupante?: string | null
          numero_espacio?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_lote_espacio_contrato_producto"
            columns: ["id_contrato_producto"]
            isOneToOne: false
            referencedRelation: "contrato_producto"
            referencedColumns: ["id_contrato_producto"]
          },
          {
            foreignKeyName: "fk_lote_espacio_lote"
            columns: ["id_lote"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id_lote"]
          },
        ]
      }
      onedrive_integration_config: {
        Row: {
          account_display_name: string | null
          account_email: string | null
          created_at: string
          id: string
          last_connected_at: string | null
          refresh_token: string
          updated_at: string
        }
        Insert: {
          account_display_name?: string | null
          account_email?: string | null
          created_at?: string
          id?: string
          last_connected_at?: string | null
          refresh_token: string
          updated_at?: string
        }
        Update: {
          account_display_name?: string | null
          account_email?: string | null
          created_at?: string
          id?: string
          last_connected_at?: string | null
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      paquete_funerario: {
        Row: {
          descripcion: string
          id_paquete: number
        }
        Insert: {
          descripcion: string
          id_paquete?: number
        }
        Update: {
          descripcion?: string
          id_paquete?: number
        }
        Relationships: []
      }
      tipo_cenizario: {
        Row: {
          descripcion: string
          id_jardin: number
          id_tipo_cenizario: number
          numero_cenizario: string
        }
        Insert: {
          descripcion: string
          id_jardin: number
          id_tipo_cenizario?: number
          numero_cenizario: string
        }
        Update: {
          descripcion?: string
          id_jardin?: number
          id_tipo_cenizario?: number
          numero_cenizario?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cenizario_jardin"
            columns: ["id_jardin"]
            isOneToOne: false
            referencedRelation: "jardin"
            referencedColumns: ["id_jardin"]
          },
        ]
      }
      tipo_cremacion: {
        Row: {
          descripcion: string
          id_tipo_cremacion: number
        }
        Insert: {
          descripcion: string
          id_tipo_cremacion?: number
        }
        Update: {
          descripcion?: string
          id_tipo_cremacion?: number
        }
        Relationships: []
      }
      tipo_lote: {
        Row: {
          cantidad_espacios: number
          descripcion: string
          id_tipo_lote: number
        }
        Insert: {
          cantidad_espacios: number
          descripcion: string
          id_tipo_lote?: number
        }
        Update: {
          cantidad_espacios?: number
          descripcion?: string
          id_tipo_lote?: number
        }
        Relationships: []
      }
      usuario_administracion_auditoria: {
        Row: {
          accion: string
          actor_email: string | null
          actor_id: string
          cambios: Json
          created_at: string
          detalle_error: string | null
          id_auditoria: number
          id_operacion: string
          resultado: string
          rol_anterior: string | null
          rol_nuevo: string | null
          target_email: string | null
          target_id: string | null
        }
        Insert: {
          accion: string
          actor_email?: string | null
          actor_id: string
          cambios?: Json
          created_at?: string
          detalle_error?: string | null
          id_auditoria?: number
          id_operacion: string
          resultado: string
          rol_anterior?: string | null
          rol_nuevo?: string | null
          target_email?: string | null
          target_id?: string | null
        }
        Update: {
          accion?: string
          actor_email?: string | null
          actor_id?: string
          cambios?: Json
          created_at?: string
          detalle_error?: string | null
          id_auditoria?: number
          id_operacion?: string
          resultado?: string
          rol_anterior?: string | null
          rol_nuevo?: string | null
          target_email?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      vendedor: {
        Row: {
          id_vendedor: number
          nombre_completo: string
        }
        Insert: {
          id_vendedor?: number
          nombre_completo: string
        }
        Update: {
          id_vendedor?: number
          nombre_completo?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_contrato_pago_extraordinario_historial: {
        Row: {
          ahorro_intereses: number | null
          created_at: string | null
          cuota_base: number | null
          cuotas_restantes_antes: number | null
          cuotas_restantes_despues: number | null
          estado_pago: string | null
          fecha_fin_antes: string | null
          fecha_fin_despues: string | null
          fecha_pago: string | null
          fecha_pago_timestamp: string | null
          id_contrato: number | null
          id_pago: number | null
          id_plan_origen: number | null
          id_plan_resultante: number | null
          interes_futuro_antes: number | null
          interes_futuro_despues: number | null
          liquidacion_total: boolean | null
          metodo_pago: string | null
          monto_extraordinario: number | null
          numero_contrato: string | null
          numero_factura: string | null
          observacion: string | null
          referencia: string | null
          registrado_por: string | null
          saldo_capital_antes: number | null
          saldo_capital_despues: number | null
          tasa_interes_anual: number | null
        }
        Relationships: []
      }
      vw_control_cuotas_plan_vigente: {
        Row: {
          capital_amortizado_acumulado: number | null
          cliente_nombre: string | null
          cuota_base: number | null
          dia_pago_mensual: number | null
          estado: string | null
          estado_contrato:
            | Database["public"]["Enums"]["estado_contrato_enum"]
            | null
          fecha_generacion: string | null
          fecha_primera_cuota: string | null
          fecha_ultimo_pago: string | null
          fecha_vencimiento: string | null
          id_contrato: number | null
          id_cuota: number | null
          id_plan_pago: number | null
          monto_ajuste_programado: number | null
          monto_capital_programado: number | null
          monto_cuota_base: number | null
          monto_cuota_total_programada: number | null
          monto_interes_programado: number | null
          monto_pagado_capital: number | null
          monto_pagado_interes: number | null
          monto_pagado_total: number | null
          notas: string | null
          numero_contrato: string | null
          numero_cuota: number | null
          numero_factura: string | null
          numero_formulario: string | null
          plan_version: number | null
          plazo_meses: number | null
          saldo_final_programado: number | null
          saldo_inicial: number | null
          tasa_interes_anual: number | null
          tasa_interes_mensual: number | null
          tipo_plan: string | null
        }
        Relationships: []
      }
      vw_control_cuotas_resumen: {
        Row: {
          cliente_nombre: string | null
          cuota_base: number | null
          cuotas_pagadas: number | null
          cuotas_parciales: number | null
          cuotas_totales: number | null
          cuotas_vencidas: number | null
          dia_pago_mensual: number | null
          estado_contrato:
            | Database["public"]["Enums"]["estado_contrato_enum"]
            | null
          fecha_firma: string | null
          fecha_generacion: string | null
          fecha_primera_cuota: string | null
          id_cliente: number | null
          id_contrato: number | null
          id_plan_pago: number | null
          mora_pendiente: number | null
          monto_vencido: number | null
          numero_contrato: string | null
          numero_formulario: string | null
          plan_fecha_primera_cuota: string | null
          plan_version: number | null
          plazo_meses: number | null
          proxima_fecha_vencimiento: string | null
          proxima_fecha_calculo_mora: string | null
          saldo_capital_pendiente: number | null
          saldo_inicial: number | null
          total_vencido_con_mora: number | null
          tipo_plan: string | null
          ultima_base_moratoria: number | null
          ultima_fecha_calculo_mora: string | null
          ultimo_interes_moratorio_generado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_contrato_cliente"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id_cliente"]
          },
        ]
      }
      vw_control_mantenimiento_cuotas: {
        Row: {
          cliente_nombre: string | null
          estado: string | null
          estado_contrato:
            | Database["public"]["Enums"]["estado_contrato_enum"]
            | null
          fecha_fin_periodo: string | null
          fecha_inicio_mantenimiento: string | null
          fecha_inicio_periodo: string | null
          fecha_ultimo_pago: string | null
          fecha_vencimiento: string | null
          id_contrato: number | null
          id_cuota_mantenimiento: number | null
          monto_mantenimiento_anual: number | null
          monto_pagado: number | null
          monto_programado: number | null
          notas: string | null
          numero_contrato: string | null
          numero_formulario: string | null
          numero_periodo: number | null
        }
        Relationships: []
      }
      vw_control_mantenimiento_resumen: {
        Row: {
          cliente_nombre: string | null
          configuracion_completa: boolean | null
          cuotas_pagadas: number | null
          cuotas_parciales: number | null
          cuotas_totales: number | null
          cuotas_vencidas: number | null
          estado_contrato:
            | Database["public"]["Enums"]["estado_contrato_enum"]
            | null
          fecha_firma: string | null
          fecha_inicio_mantenimiento: string | null
          id_cliente: number | null
          id_contrato: number | null
          mora_generada: number | null
          mora_pagada: number | null
          mora_pendiente: number | null
          monto_mantenimiento_anual: number | null
          monto_vencido: number | null
          numero_contrato: string | null
          numero_formulario: string | null
          proxima_fecha_vencimiento: string | null
          proxima_fecha_calculo_mora: string | null
          total_pendiente: number | null
          total_pendiente_con_mora: number | null
          ultima_base_moratoria: number | null
          ultima_fecha_calculo_mora: string | null
          ultimo_interes_moratorio_generado: number | null
          ultimo_periodo_cubierto_hasta: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_contrato_cliente"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id_cliente"]
          },
        ]
      }
    }
    Functions: {
      anular_contrato: {
        Args: { p_id_contrato: number; p_usuario?: string }
        Returns: Json
      }
      calcular_fecha_primera_cuota: {
        Args: { p_dia_pago: number; p_fecha_referencia: string }
        Returns: string
      }
      calcular_fecha_vencimiento_cuota: {
        Args: { p_fecha_primera_cuota: string; p_numero_cuota: number }
        Returns: string
      }
      calcular_fecha_corte_mora_mensual: {
        Args: { p_fecha_ancla: string; p_meses_desde_ancla: number }
        Returns: string
      }
      crear_arreglo_pago_contrato: {
        Args: {
          p_cuota_base: number
          p_fecha_primera_cuota: string
          p_id_contrato: number
          p_observaciones?: string
          p_plazo_meses: number
          p_tasa_interes_anual?: number
          p_usuario?: string
        }
        Returns: Json
      }
      formalizar_contrato_y_generar_plan_pago: {
        Args: {
          p_fecha_primera_cuota: string
          p_id_contrato: number
          p_numero_formulario: string
          p_usuario?: string
        }
        Returns: Json
      }
      generar_numero_precontrato: { Args: never; Returns: string }
      generar_plan_pago_base_contrato: {
        Args: {
          p_fecha_primera_cuota?: string
          p_id_contrato: number
          p_usuario?: string
        }
        Returns: Json
      }
      generar_plan_pago_contrato: {
        Args: {
          p_fecha_primera_cuota?: string
          p_id_contrato: number
          p_id_plan_anterior?: number
          p_observaciones?: string
          p_reemplazar_plan_vigente?: boolean
          p_tipo_plan?: string
          p_usuario?: string
        }
        Returns: Json
      }
      obtener_proxima_fecha_calculo_mora: {
        Args: { p_id_contrato: number }
        Returns: string
      }
      obtener_proxima_fecha_calculo_mora_mantenimiento: {
        Args: { p_id_contrato: number }
        Returns: string
      }
      proyectar_pago_extraordinario_contrato: {
        Args: {
          p_fecha_pago: string
          p_id_contrato: number
          p_monto_extraordinario: number
        }
        Returns: Json
      }
      registrar_pago_contrato: {
        Args: {
          p_fecha_pago?: string
          p_id_contrato: number
          p_idempotency_key?: string
          p_metodo_pago?: string
          p_monto_total: number
          p_numero_factura?: string
          p_observacion?: string
          p_referencia?: string
          p_usuario?: string
        }
        Returns: Json
      }
      registrar_pago_extraordinario_contrato: {
        Args: {
          p_fecha_pago?: string
          p_id_contrato: number
          p_idempotency_key?: string
          p_metodo_pago?: string
          p_monto_total: number
          p_numero_factura?: string
          p_observacion?: string
          p_referencia?: string
          p_usuario?: string
        }
        Returns: Json
      }
      registrar_pago_mora_contrato: {
        Args: {
          p_fecha_pago?: string
          p_id_contrato: number
          p_idempotency_key?: string
          p_metodo_pago?: string
          p_monto_total: number
          p_numero_factura?: string
          p_observacion?: string
          p_referencia?: string
          p_usuario?: string
        }
        Returns: Json
      }
      registrar_pago_mantenimiento: {
        Args: {
          p_fecha_pago?: string
          p_id_contrato: number
          p_idempotency_key?: string
          p_metodo_pago?: string
          p_monto_total: number
          p_observacion?: string
          p_referencia?: string
          p_usuario?: string
        }
        Returns: Json
      }
      registrar_sync_anulacion_onedrive: {
        Args: {
          p_error?: string
          p_estado: string
          p_id_contrato: number
          p_usuario?: string
        }
        Returns: Json
      }
      sincronizar_cuotas_mantenimiento_contrato: {
        Args: {
          p_hasta_fecha?: string
          p_id_contrato: number
          p_usuario?: string
        }
        Returns: Json
      }
      sincronizar_cuotas_mantenimiento_vigentes: {
        Args: { p_usuario?: string }
        Returns: Json
      }
      registrar_pago_mora_mantenimiento: {
        Args: {
          p_fecha_pago?: string
          p_id_contrato: number
          p_idempotency_key?: string
          p_metodo_pago?: string
          p_monto_total: number
          p_observacion?: string
          p_referencia?: string
          p_usuario?: string
        }
        Returns: Json
      }
      sincronizar_interes_moratorio_contrato: {
        Args: {
          p_fecha_hasta?: string
          p_id_contrato: number
          p_usuario?: string
        }
        Returns: Json
      }
      sincronizar_interes_moratorio_mantenimiento_contrato: {
        Args: {
          p_fecha_hasta?: string
          p_id_contrato: number
          p_usuario?: string
        }
        Returns: Json
      }
      sincronizar_interes_moratorio_masivo: {
        Args: {
          p_fecha_hasta?: string
          p_limite?: number
          p_usuario?: string
        }
        Returns: Json
      }
      simular_pago_extraordinario_contrato: {
        Args: {
          p_fecha_pago?: string
          p_id_contrato: number
          p_monto_extraordinario: number
          p_usuario?: string
        }
        Returns: Json
      }
      sumar_meses_respetando_dia: {
        Args: { p_fecha_base: string; p_meses: number }
        Returns: string
      }
    }
    Enums: {
      estado_contrato_enum:
        | "PRECONTRATO"
        | "VIGENTE"
        | "FINALIZADO"
        | "FALLIDO"
        | "ANULADO"
        | "CONTRATO"
      tipo_producto_enum:
        | "LOTE"
        | "PAQUETE_FUNERARIO"
        | "CENIZARIO"
        | "CREMACION"
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
      estado_contrato_enum: [
        "PRECONTRATO",
        "VIGENTE",
        "FINALIZADO",
        "FALLIDO",
        "ANULADO",
        "CONTRATO",
      ],
      tipo_producto_enum: [
        "LOTE",
        "PAQUETE_FUNERARIO",
        "CENIZARIO",
        "CREMACION",
      ],
    },
  },
} as const
