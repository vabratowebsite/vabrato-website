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
      deal_contingencies: {
        Row: {
          deal_id: string
          due_date: string | null
          id: string
          kind: string
          offset_days: number
          removed_at: string | null
        }
        Insert: {
          deal_id: string
          due_date?: string | null
          id?: string
          kind: string
          offset_days: number
          removed_at?: string | null
        }
        Update: {
          deal_id?: string
          due_date?: string | null
          id?: string
          kind?: string
          offset_days?: number
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_contingencies_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_members: {
        Row: {
          created_at: string
          deal_id: string
          member_role: Database["public"]["Enums"]["deal_member_role"]
          profile_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          member_role: Database["public"]["Enums"]["deal_member_role"]
          profile_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          member_role?: Database["public"]["Enums"]["deal_member_role"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_members_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_vendors: {
        Row: {
          confirmed: boolean
          created_at: string
          deal_id: string
          vendor_id: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          deal_id: string
          vendor_id: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          deal_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_vendors_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          address: string
          agent_id: string | null
          created_at: string
          created_by: string
          days_to_close: number
          escrow_number: string | null
          id: string
          ratification_date: string
          rent_back_days: number
          sale_price: number | null
          seller_name: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
        }
        Insert: {
          address: string
          agent_id?: string | null
          created_at?: string
          created_by?: string
          days_to_close?: number
          escrow_number?: string | null
          id?: string
          ratification_date: string
          rent_back_days?: number
          sale_price?: number | null
          seller_name?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"]
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          agent_id?: string | null
          created_at?: string
          created_by?: string
          days_to_close?: number
          escrow_number?: string | null
          id?: string
          ratification_date?: string
          rent_back_days?: number
          sale_price?: number | null
          seller_name?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"]
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          description?: string
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          description?: string
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_emails: {
        Row: {
          id: string
          parsed_ok: boolean
          raw: Json
          received_at: string
          source: string
        }
        Insert: {
          id?: string
          parsed_ok?: boolean
          raw: Json
          received_at?: string
          source: string
        }
        Update: {
          id?: string
          parsed_ok?: boolean
          raw?: Json
          received_at?: string
          source?: string
        }
        Relationships: []
      }
      mls_agent_access: {
        Row: {
          active: boolean
          member_key: string
          profile_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          member_key: string
          profile_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          member_key?: string
          profile_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mls_agent_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_listing_full: {
        Row: {
          data: Json
          data_level: Database["public"]["Enums"]["mls_data_level"]
          listing_key: string
          synced_at: string
        }
        Insert: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          listing_key: string
          synced_at?: string
        }
        Update: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          listing_key?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mls_listing_full_listing_key_fkey"
            columns: ["listing_key"]
            isOneToOne: true
            referencedRelation: "mls_listings"
            referencedColumns: ["listing_key"]
          },
        ]
      }
      mls_listing_vow: {
        Row: {
          data: Json
          data_level: Database["public"]["Enums"]["mls_data_level"]
          listing_key: string
          synced_at: string
        }
        Insert: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          listing_key: string
          synced_at?: string
        }
        Update: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          listing_key?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mls_listing_vow_listing_key_fkey"
            columns: ["listing_key"]
            isOneToOne: true
            referencedRelation: "mls_listings"
            referencedColumns: ["listing_key"]
          },
        ]
      }
      mls_listings: {
        Row: {
          address_display: boolean
          avm_display: boolean
          bathrooms_total: number | null
          bedrooms_total: number | null
          city: string | null
          comments_display: boolean
          county: string | null
          data: Json
          data_level: Database["public"]["Enums"]["mls_data_level"]
          is_own_listing: boolean
          latitude: number | null
          list_agent_full_name: string | null
          list_office_mls_id: string | null
          list_office_name: string | null
          list_price: number | null
          listing_id: string | null
          listing_key: string
          living_area: number | null
          longitude: number | null
          modification_ts: string
          postal_code: string | null
          property_sub_type: string | null
          property_type: string | null
          source: string
          standard_status: string
          synced_at: string
        }
        Insert: {
          address_display?: boolean
          avm_display?: boolean
          bathrooms_total?: number | null
          bedrooms_total?: number | null
          city?: string | null
          comments_display?: boolean
          county?: string | null
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          is_own_listing?: boolean
          latitude?: number | null
          list_agent_full_name?: string | null
          list_office_mls_id?: string | null
          list_office_name?: string | null
          list_price?: number | null
          listing_id?: string | null
          listing_key: string
          living_area?: number | null
          longitude?: number | null
          modification_ts: string
          postal_code?: string | null
          property_sub_type?: string | null
          property_type?: string | null
          source?: string
          standard_status: string
          synced_at?: string
        }
        Update: {
          address_display?: boolean
          avm_display?: boolean
          bathrooms_total?: number | null
          bedrooms_total?: number | null
          city?: string | null
          comments_display?: boolean
          county?: string | null
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          is_own_listing?: boolean
          latitude?: number | null
          list_agent_full_name?: string | null
          list_office_mls_id?: string | null
          list_office_name?: string | null
          list_price?: number | null
          listing_id?: string | null
          listing_key?: string
          living_area?: number | null
          longitude?: number | null
          modification_ts?: string
          postal_code?: string | null
          property_sub_type?: string | null
          property_type?: string | null
          source?: string
          standard_status?: string
          synced_at?: string
        }
        Relationships: []
      }
      mls_media: {
        Row: {
          category: string | null
          data_level: Database["public"]["Enums"]["mls_data_level"]
          height: number | null
          listing_key: string
          media_key: string
          modification_ts: string | null
          short_description: string | null
          sort_order: number
          storage_path: string | null
          url: string | null
          width: number | null
        }
        Insert: {
          category?: string | null
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          height?: number | null
          listing_key: string
          media_key: string
          modification_ts?: string | null
          short_description?: string | null
          sort_order?: number
          storage_path?: string | null
          url?: string | null
          width?: number | null
        }
        Update: {
          category?: string | null
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          height?: number | null
          listing_key?: string
          media_key?: string
          modification_ts?: string | null
          short_description?: string | null
          sort_order?: number
          storage_path?: string | null
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mls_media_listing_key_fkey"
            columns: ["listing_key"]
            isOneToOne: false
            referencedRelation: "mls_listings"
            referencedColumns: ["listing_key"]
          },
        ]
      }
      mls_members: {
        Row: {
          data: Json
          data_level: Database["public"]["Enums"]["mls_data_level"]
          email: string | null
          full_name: string | null
          member_key: string
          member_mls_id: string | null
          member_status: string | null
          modification_ts: string | null
          office_mls_id: string | null
        }
        Insert: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          email?: string | null
          full_name?: string | null
          member_key: string
          member_mls_id?: string | null
          member_status?: string | null
          modification_ts?: string | null
          office_mls_id?: string | null
        }
        Update: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          email?: string | null
          full_name?: string | null
          member_key?: string
          member_mls_id?: string | null
          member_status?: string | null
          modification_ts?: string | null
          office_mls_id?: string | null
        }
        Relationships: []
      }
      mls_offices: {
        Row: {
          data: Json
          data_level: Database["public"]["Enums"]["mls_data_level"]
          modification_ts: string | null
          name: string | null
          office_key: string
          office_mls_id: string | null
          phone: string | null
        }
        Insert: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          modification_ts?: string | null
          name?: string | null
          office_key: string
          office_mls_id?: string | null
          phone?: string | null
        }
        Update: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          modification_ts?: string | null
          name?: string | null
          office_key?: string
          office_mls_id?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      mls_open_houses: {
        Row: {
          data_level: Database["public"]["Enums"]["mls_data_level"]
          end_time: string | null
          listing_key: string
          modification_ts: string | null
          open_house_date: string | null
          open_house_key: string
          open_house_type: string | null
          remarks: string | null
          start_time: string | null
        }
        Insert: {
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          end_time?: string | null
          listing_key: string
          modification_ts?: string | null
          open_house_date?: string | null
          open_house_key: string
          open_house_type?: string | null
          remarks?: string | null
          start_time?: string | null
        }
        Update: {
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          end_time?: string | null
          listing_key?: string
          modification_ts?: string | null
          open_house_date?: string | null
          open_house_key?: string
          open_house_type?: string | null
          remarks?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mls_open_houses_listing_key_fkey"
            columns: ["listing_key"]
            isOneToOne: false
            referencedRelation: "mls_listings"
            referencedColumns: ["listing_key"]
          },
        ]
      }
      mls_price_events: {
        Row: {
          data_level: Database["public"]["Enums"]["mls_data_level"]
          id: number
          list_price: number | null
          listing_key: string
          observed_at: string
          standard_status: string | null
        }
        Insert: {
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          id?: never
          list_price?: number | null
          listing_key: string
          observed_at: string
          standard_status?: string | null
        }
        Update: {
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          id?: never
          list_price?: number | null
          listing_key?: string
          observed_at?: string
          standard_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mls_price_events_listing_key_fkey"
            columns: ["listing_key"]
            isOneToOne: false
            referencedRelation: "mls_listings"
            referencedColumns: ["listing_key"]
          },
        ]
      }
      mls_sync_runs: {
        Row: {
          counts: Json
          error: string | null
          finished_at: string | null
          high_water_mark: string | null
          id: string
          kind: Database["public"]["Enums"]["mls_sync_kind"]
          started_at: string
          status: Database["public"]["Enums"]["mls_sync_status"]
        }
        Insert: {
          counts?: Json
          error?: string | null
          finished_at?: string | null
          high_water_mark?: string | null
          id?: string
          kind: Database["public"]["Enums"]["mls_sync_kind"]
          started_at?: string
          status?: Database["public"]["Enums"]["mls_sync_status"]
        }
        Update: {
          counts?: Json
          error?: string | null
          finished_at?: string | null
          high_water_mark?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["mls_sync_kind"]
          started_at?: string
          status?: Database["public"]["Enums"]["mls_sync_status"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          deal_id: string | null
          id: string
          payload: Json
          recipient_email: string | null
          recipient_profile_id: string | null
          send_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_key: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_profile_id?: string | null
          send_at: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_key: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_profile_id?: string | null
          send_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          vow_accepted_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vow_accepted_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vow_accepted_at?: string | null
        }
        Relationships: []
      }
      property_events: {
        Row: {
          id: string
          kind: string
          occurred_at: string
          payload: Json
          source_email_id: string | null
          tracked_property_id: string
        }
        Insert: {
          id?: string
          kind: string
          occurred_at?: string
          payload?: Json
          source_email_id?: string | null
          tracked_property_id: string
        }
        Update: {
          id?: string
          kind?: string
          occurred_at?: string
          payload?: Json
          source_email_id?: string | null
          tracked_property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_events_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_events_tracked_property_id_fkey"
            columns: ["tracked_property_id"]
            isOneToOne: false
            referencedRelation: "tracked_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          deal_id: string
          id: string
          receipt_date: string
          source: Database["public"]["Enums"]["receipt_source"]
          storage_path: string | null
          vendor: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string
          deal_id: string
          id?: string
          receipt_date: string
          source?: Database["public"]["Enums"]["receipt_source"]
          storage_path?: string | null
          vendor: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          deal_id?: string
          id?: string
          receipt_date?: string
          source?: Database["public"]["Enums"]["receipt_source"]
          storage_path?: string | null
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          deal_id: string
          done: boolean
          done_at: string | null
          due_date: string
          id: string
          offset_days: number
          owner: string
          phase: Database["public"]["Enums"]["task_phase"]
          title: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          done?: boolean
          done_at?: string | null
          due_date: string
          id?: string
          offset_days: number
          owner: string
          phase: Database["public"]["Enums"]["task_phase"]
          title: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          done?: boolean
          done_at?: string | null
          due_date?: string
          id?: string
          offset_days?: number
          owner?: string
          phase?: Database["public"]["Enums"]["task_phase"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_properties: {
        Row: {
          address: string
          buyer_id: string
          created_at: string
          id: string
          source: string | null
          status: string
        }
        Insert: {
          address: string
          buyer_id?: string
          created_at?: string
          id?: string
          source?: string | null
          status?: string
        }
        Update: {
          address?: string
          buyer_id?: string
          created_at?: string
          id?: string
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_properties_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          preferred: boolean
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          preferred?: boolean
          role: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          preferred?: boolean
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      flag_enabled: { Args: { p_key: string }; Returns: boolean }
      has_deal_access: { Args: { p_deal_id: string }; Returns: boolean }
      has_full_mls_access: { Args: never; Returns: boolean }
      has_vow_access: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      mls_sync_health: {
        Args: never
        Returns: {
          last_failure_at: string
          last_status: Database["public"]["Enums"]["mls_sync_status"]
          last_success_at: string
          stale: boolean
        }[]
      }
      storage_deal_id: { Args: { object_name: string }; Returns: string }
    }
    Enums: {
      deal_member_role: "seller" | "agent" | "va" | "tc"
      deal_status: "active" | "closed" | "cancelled"
      mls_data_level: "IDX" | "VOW" | "FULL"
      mls_sync_kind: "incremental" | "reconcile" | "purge"
      mls_sync_status: "running" | "succeeded" | "failed"
      notification_status: "scheduled" | "sent" | "cancelled" | "failed"
      receipt_source: "drive" | "dropbox" | "manual"
      seller_type: "normal" | "trust" | "successor_trustee" | "probate"
      task_phase: "after_ratification" | "closing_week" | "after_coe"
      user_role: "admin" | "agent" | "va" | "tc" | "seller" | "buyer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      deal_member_role: ["seller", "agent", "va", "tc"],
      deal_status: ["active", "closed", "cancelled"],
      mls_data_level: ["IDX", "VOW", "FULL"],
      mls_sync_kind: ["incremental", "reconcile", "purge"],
      mls_sync_status: ["running", "succeeded", "failed"],
      notification_status: ["scheduled", "sent", "cancelled", "failed"],
      receipt_source: ["drive", "dropbox", "manual"],
      seller_type: ["normal", "trust", "successor_trustee", "probate"],
      task_phase: ["after_ratification", "closing_week", "after_coe"],
      user_role: ["admin", "agent", "va", "tc", "seller", "buyer"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
