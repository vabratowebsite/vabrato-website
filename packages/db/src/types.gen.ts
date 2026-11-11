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
      account_deletion_requests: {
        Row: {
          handled_at: string | null
          handled_by: string | null
          id: string
          note: string | null
          profile_id: string | null
          requested_at: string
          status: Database["public"]["Enums"]["deletion_request_status"]
        }
        Insert: {
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          profile_id?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["deletion_request_status"]
        }
        Update: {
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          profile_id?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["deletion_request_status"]
        }
        Relationships: []
      }
      alert_deliveries: {
        Row: {
          created_at: string
          emailed_at: string | null
          id: number
          kind: Database["public"]["Enums"]["alert_kind"]
          listing_key: string
          new_price: number | null
          price_event_id: number
          profile_id: string
          saved_search_id: string | null
          seen_at: string | null
        }
        Insert: {
          created_at?: string
          emailed_at?: string | null
          id?: never
          kind: Database["public"]["Enums"]["alert_kind"]
          listing_key: string
          new_price?: number | null
          price_event_id: number
          profile_id: string
          saved_search_id?: string | null
          seen_at?: string | null
        }
        Update: {
          created_at?: string
          emailed_at?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["alert_kind"]
          listing_key?: string
          new_price?: number | null
          price_event_id?: number
          profile_id?: string
          saved_search_id?: string | null
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_deliveries_saved_search_id_fkey"
            columns: ["saved_search_id"]
            isOneToOne: false
            referencedRelation: "saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_state: {
        Row: {
          id: boolean
          last_digest_on: string | null
          last_price_event_id: number | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          last_digest_on?: string | null
          last_price_event_id?: number | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          last_digest_on?: string | null
          last_price_event_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_profiles: {
        Row: {
          bio: string
          display_name: string
          email: string | null
          faq: Json
          history: string
          is_placeholder: boolean
          license_number: string | null
          mls_member_id: string | null
          outlook: string
          phone: string | null
          photo_path: string | null
          profile_id: string | null
          published: boolean
          skills: Json
          slug: string
          social_links: Json
          sort: number
          start_year: number | null
          title: string
          updated_at: string
          video_youtube_id: string | null
        }
        Insert: {
          bio?: string
          display_name: string
          email?: string | null
          faq?: Json
          history?: string
          is_placeholder?: boolean
          license_number?: string | null
          mls_member_id?: string | null
          outlook?: string
          phone?: string | null
          photo_path?: string | null
          profile_id?: string | null
          published?: boolean
          skills?: Json
          slug: string
          social_links?: Json
          sort?: number
          start_year?: number | null
          title?: string
          updated_at?: string
          video_youtube_id?: string | null
        }
        Update: {
          bio?: string
          display_name?: string
          email?: string | null
          faq?: Json
          history?: string
          is_placeholder?: boolean
          license_number?: string | null
          mls_member_id?: string | null
          outlook?: string
          phone?: string | null
          photo_path?: string | null
          profile_id?: string | null
          published?: boolean
          skills?: Json
          slug?: string
          social_links?: Json
          sort?: number
          start_year?: number | null
          title?: string
          updated_at?: string
          video_youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          backup_admin_id: string | null
          default_agent_id: string | null
          id: boolean
          lead_admin_away: boolean
          lead_admin_away_until: string | null
          lead_admin_id: string | null
          lead_escalation_minutes: number
          lead_flood_cap: number
          mls_sync_live: boolean
          updated_at: string
        }
        Insert: {
          backup_admin_id?: string | null
          default_agent_id?: string | null
          id?: boolean
          lead_admin_away?: boolean
          lead_admin_away_until?: string | null
          lead_admin_id?: string | null
          lead_escalation_minutes?: number
          lead_flood_cap?: number
          mls_sync_live?: boolean
          updated_at?: string
        }
        Update: {
          backup_admin_id?: string | null
          default_agent_id?: string | null
          id?: boolean
          lead_admin_away?: boolean
          lead_admin_away_until?: string | null
          lead_admin_id?: string | null
          lead_escalation_minutes?: number
          lead_flood_cap?: number
          mls_sync_live?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          county: string
          created_at: string
          kind: Database["public"]["Enums"]["city_kind"]
          mls_city_names: string[]
          name: string
          priority: number
          slug: string
        }
        Insert: {
          county: string
          created_at?: string
          kind?: Database["public"]["Enums"]["city_kind"]
          mls_city_names: string[]
          name: string
          priority?: number
          slug: string
        }
        Update: {
          county?: string
          created_at?: string
          kind?: Database["public"]["Enums"]["city_kind"]
          mls_city_names?: string[]
          name?: string
          priority?: number
          slug?: string
        }
        Relationships: []
      }
      city_guides: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          city_slug: string
          faq: Json
          intro: string
          is_placeholder: boolean
          neighborhoods: Json
          published: boolean
          school_links: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          city_slug: string
          faq?: Json
          intro?: string
          is_placeholder?: boolean
          neighborhoods?: Json
          published?: boolean
          school_links?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          city_slug?: string
          faq?: Json
          intro?: string
          is_placeholder?: boolean
          neighborhoods?: Json
          published?: boolean
          school_links?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_guides_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: true
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
        ]
      }
      cmas: {
        Row: {
          comp_keys: string[]
          created_at: string
          created_by: string
          id: string
          subject: Json
          title: string
          updated_at: string
        }
        Insert: {
          comp_keys?: string[]
          created_at?: string
          created_by?: string
          id?: string
          subject?: Json
          title: string
          updated_at?: string
        }
        Update: {
          comp_keys?: string[]
          created_at?: string
          created_by?: string
          id?: string
          subject?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_revisions: {
        Row: {
          body: Json
          created_at: string
          created_by: string | null
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          row_key: string | null
          status: Database["public"]["Enums"]["revision_status"]
          submitted_at: string | null
          table_name: Database["public"]["Enums"]["content_table"]
          updated_at: string
        }
        Insert: {
          body: Json
          created_at?: string
          created_by?: string | null
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_key?: string | null
          status?: Database["public"]["Enums"]["revision_status"]
          submitted_at?: string | null
          table_name: Database["public"]["Enums"]["content_table"]
          updated_at?: string
        }
        Update: {
          body?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_key?: string | null
          status?: Database["public"]["Enums"]["revision_status"]
          submitted_at?: string | null
          table_name?: Database["public"]["Enums"]["content_table"]
          updated_at?: string
        }
        Relationships: []
      }
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
          listing_key: string | null
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
          listing_key?: string | null
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
          listing_key?: string | null
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
      featured_listings: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          listing_key: string
          sort: number
          starts_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          listing_key: string
          sort?: number
          starts_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          listing_key?: string
          sort?: number
          starts_at?: string | null
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
      lead_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: number
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: number
          lead_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: number
          lead_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          city_slug: string | null
          closed_reason: string | null
          consent_contact: boolean
          created_at: string
          email: string
          escalated_at: string | null
          first_reply_at: string | null
          id: string
          ip_hash: string | null
          kind: Database["public"]["Enums"]["lead_kind"]
          listing_key: string | null
          message: string | null
          name: string | null
          payload: Json
          phone: string | null
          profile_id: string | null
          site: string
          status: string
          tour_confirmed_at: string | null
          tour_confirmed_by: string | null
          tour_status: Database["public"]["Enums"]["tour_status"] | null
        }
        Insert: {
          assigned_to?: string | null
          city_slug?: string | null
          closed_reason?: string | null
          consent_contact?: boolean
          created_at?: string
          email: string
          escalated_at?: string | null
          first_reply_at?: string | null
          id?: string
          ip_hash?: string | null
          kind: Database["public"]["Enums"]["lead_kind"]
          listing_key?: string | null
          message?: string | null
          name?: string | null
          payload?: Json
          phone?: string | null
          profile_id?: string | null
          site?: string
          status?: string
          tour_confirmed_at?: string | null
          tour_confirmed_by?: string | null
          tour_status?: Database["public"]["Enums"]["tour_status"] | null
        }
        Update: {
          assigned_to?: string | null
          city_slug?: string | null
          closed_reason?: string | null
          consent_contact?: boolean
          created_at?: string
          email?: string
          escalated_at?: string | null
          first_reply_at?: string | null
          id?: string
          ip_hash?: string | null
          kind?: Database["public"]["Enums"]["lead_kind"]
          listing_key?: string | null
          message?: string | null
          name?: string | null
          payload?: Json
          phone?: string | null
          profile_id?: string | null
          site?: string
          status?: string
          tour_confirmed_at?: string | null
          tour_confirmed_by?: string | null
          tour_status?: Database["public"]["Enums"]["tour_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_view_keys: {
        Row: {
          created_at: string
          key_hash: string
        }
        Insert: {
          created_at?: string
          key_hash: string
        }
        Update: {
          created_at?: string
          key_hash?: string
        }
        Relationships: []
      }
      listing_view_visitors: {
        Row: {
          day: string
          listing_key: string
          visitor: string
        }
        Insert: {
          day: string
          listing_key: string
          visitor: string
        }
        Update: {
          day?: string
          listing_key?: string
          visitor?: string
        }
        Relationships: []
      }
      listing_views_daily: {
        Row: {
          day: string
          listing_key: string
          views: number
        }
        Insert: {
          day: string
          listing_key: string
          views?: number
        }
        Update: {
          day?: string
          listing_key?: string
          views?: number
        }
        Relationships: []
      }
      member_documents: {
        Row: {
          content_type: string
          created_at: string
          id: string
          name: string
          profile_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          content_type: string
          created_at?: string
          id?: string
          name: string
          profile_id: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          name?: string
          profile_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: number
          member_id: string
          read_at: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          member_id: string
          read_at?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          member_id?: string
          read_at?: string | null
          sender_id?: string | null
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
          source: string
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
          source?: string
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
          source?: string
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
          source: string
        }
        Insert: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          modification_ts?: string | null
          name?: string | null
          office_key: string
          office_mls_id?: string | null
          phone?: string | null
          source?: string
        }
        Update: {
          data?: Json
          data_level?: Database["public"]["Enums"]["mls_data_level"]
          modification_ts?: string | null
          name?: string | null
          office_key?: string
          office_mls_id?: string | null
          phone?: string | null
          source?: string
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
      notification_errors: {
        Row: {
          created_at: string
          detail: string
          id: number
          source: string
        }
        Insert: {
          created_at?: string
          detail: string
          id?: number
          source: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: number
          source?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          deal_id: string | null
          dedupe_key: string | null
          failure_reason: string | null
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
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          deal_id?: string | null
          dedupe_key?: string | null
          failure_reason?: string | null
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
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          deal_id?: string | null
          dedupe_key?: string | null
          failure_reason?: string | null
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
      open_house_signin_links: {
        Row: {
          created_at: string
          created_by: string | null
          open_house_key: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          open_house_key: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          open_house_key?: string
          token?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_md: string
          excerpt: string
          is_placeholder: boolean
          kind: Database["public"]["Enums"]["post_kind"]
          published: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          excerpt?: string
          is_placeholder?: boolean
          kind?: Database["public"]["Enums"]["post_kind"]
          published?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          excerpt?: string
          is_placeholder?: boolean
          kind?: Database["public"]["Enums"]["post_kind"]
          published?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          buyer_agreement_on_file_at: string | null
          agent_id: string | null
          alerts_email_opt_in: boolean
          alerts_opt_in_at: string | null
          alerts_unsubscribe_token: string
          created_at: string
          email: string
          full_name: string
          id: string
          onboarded_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          vow_accepted_at: string | null
          vow_terms_version: string | null
        }
        Insert: {
          buyer_agreement_on_file_at?: string | null
          agent_id?: string | null
          alerts_email_opt_in?: boolean
          alerts_opt_in_at?: string | null
          alerts_unsubscribe_token?: string
          created_at?: string
          email: string
          full_name?: string
          id: string
          onboarded_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vow_accepted_at?: string | null
          vow_terms_version?: string | null
        }
        Update: {
          buyer_agreement_on_file_at?: string | null
          agent_id?: string | null
          alerts_email_opt_in?: boolean
          alerts_opt_in_at?: string | null
          alerts_unsubscribe_token?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          onboarded_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vow_accepted_at?: string | null
          vow_terms_version?: string | null
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
      seller_report_sends: {
        Row: {
          deal_id: string
          recipients: number
          sent_at: string
          sent_by: string | null
          week_start: string
        }
        Insert: {
          deal_id: string
          recipients: number
          sent_at?: string
          sent_by?: string | null
          week_start: string
        }
        Update: {
          deal_id?: string
          recipients?: number
          sent_at?: string
          sent_by?: string | null
          week_start?: string
        }
        Relationships: []
      }
      staff_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: number
          ref_id: string | null
          ref_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: number
          ref_id?: string | null
          ref_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: number
          ref_id?: string | null
          ref_table?: string | null
        }
        Relationships: []
      }
      staff_notifications: {
        Row: {
          created_at: string
          id: number
          kind: string
          read_at: string | null
          recipient_id: string
          ref_id: string | null
          ref_table: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          read_at?: string | null
          recipient_id: string
          ref_id?: string | null
          ref_table?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          read_at?: string | null
          recipient_id?: string
          ref_id?: string | null
          ref_table?: string | null
          title?: string
        }
        Relationships: []
      }
      sync_alert_state: {
        Row: {
          closed_at: string | null
          id: boolean
          incident_open: boolean
          opened_at: string | null
        }
        Insert: {
          closed_at?: string | null
          id?: boolean
          incident_open?: boolean
          opened_at?: string | null
        }
        Update: {
          closed_at?: string | null
          id?: boolean
          incident_open?: boolean
          opened_at?: string | null
        }
        Relationships: []
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
      saved_homes: {
        Row: {
          created_at: string
          listing_key: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          listing_key: string
          profile_id?: string
        }
        Update: {
          created_at?: string
          listing_key?: string
          profile_id?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          created_at: string
          criteria: Json
          frequency: Database["public"]["Enums"]["alert_frequency"]
          id: string
          last_run_at: string | null
          name: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria: Json
          frequency?: Database["public"]["Enums"]["alert_frequency"]
          id?: string
          last_run_at?: string | null
          name: string
          profile_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          frequency?: Database["public"]["Enums"]["alert_frequency"]
          id?: string
          last_run_at?: string | null
          name?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          author_display: string
          created_at: string
          id: string
          is_placeholder: boolean
          permission_confirmed: boolean
          published: boolean
          quote: string
          role: string | null
          sort: number
          source: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          author_display: string
          created_at?: string
          id?: string
          is_placeholder?: boolean
          permission_confirmed?: boolean
          published?: boolean
          quote: string
          role?: string | null
          sort?: number
          source?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          author_display?: string
          created_at?: string
          id?: string
          is_placeholder?: boolean
          permission_confirmed?: boolean
          published?: boolean
          quote?: string
          role?: string | null
          sort?: number
          source?: string | null
        }
        Relationships: []
      }
      tracked_properties: {
        Row: {
          listing_key: string | null
          address: string
          buyer_id: string
          created_at: string
          id: string
          source: string | null
          status: string
        }
        Insert: {
          listing_key?: string | null
          address: string
          buyer_id?: string
          created_at?: string
          id?: string
          source?: string | null
          status?: string
        }
        Update: {
          listing_key?: string | null
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
      videos: {
        Row: {
          created_at: string
          id: string
          is_placeholder: boolean
          published: boolean
          sort: number
          title: string
          youtube_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_placeholder?: boolean
          published?: boolean
          sort?: number
          title: string
          youtube_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_placeholder?: boolean
          published?: boolean
          sort?: number
          title?: string
          youtube_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_vow_terms: { Args: { p_version: string }; Returns: string }
      can_manage_settings: { Args: never; Returns: boolean }
      can_see_member: { Args: { p_profile: string }; Returns: boolean }
      can_work_lead: { Args: { p_lead: string }; Returns: boolean }
      check_sync_health: { Args: never; Returns: string }
      claim_due_notifications: {
        Args: { p_batch?: number }
        Returns: {
          alerts_email_opt_in: boolean
          attempts: number
          id: string
          payload: Json
          profile_email: string
          recipient_email: string
          template_key: string
        }[]
      }
      cma_comps: { Args: { p_city_slugs?: string[]; p_keys?: string[]; p_limit?: number; p_max_beds?: number; p_max_sqft?: number; p_min_baths?: number; p_min_beds?: number; p_min_sqft?: number; p_months?: number; p_sub_types?: string[] }; Returns: { bathrooms_total: number | null; bedrooms_total: number | null; city: string | null; close_date: string | null; close_price: number | null; days_on_market: number | null; is_own_listing: boolean; list_office_name: string | null; list_price: number | null; listing_key: string; living_area: number | null; price_per_sqft: number | null; property_sub_type: string | null; street: string | null }[] }
      cma_subject_ok: { Args: { s: Json }; Returns: boolean }
      complete_notification: { Args: { p_id: string }; Returns: undefined }
      complete_onboarding: { Args: never; Returns: undefined }
      content_body_ok: { Args: { p_body: Json; p_key: string; p_table: Database["public"]["Enums"]["content_table"] }; Returns: string }
      content_launch_blockers: {
        Args: never
        Returns: {
          row_key: string
          table_name: string
        }[]
      }
      flag_enabled: { Args: { p_key: string }; Returns: boolean }
      has_deal_access: { Args: { p_deal_id: string }; Returns: boolean }
      has_full_mls_access: { Args: never; Returns: boolean }
      has_verified_mls_access: { Args: never; Returns: boolean }
      has_vow_access: { Args: never; Returns: boolean }
      is_acting_lead_admin: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      lead_admin_away_now: { Args: never; Returns: boolean }
      lead_routing_unset: { Args: never; Returns: boolean }
      listing_cards: {
        Args: { p_keys: string[] }
        Returns: {
          address_display: boolean
          bathrooms_total: number
          bedrooms_total: number
          city: string
          is_own_listing: boolean
          latitude: number
          list_office_name: string
          list_price: number
          listing_id: string
          listing_key: string
          living_area: number
          longitude: number
          modification_ts: string
          next_open_house_end: string
          next_open_house_start: string
          on_market_date: string
          photo_storage_path: string
          photo_url: string
          postal_code: string
          property_sub_type: string
          property_type: string
          standard_status: string
          street: string
          total_count: number
        }[]
      }
      listing_performance: { Args: { p_deal: string }; Returns: Json }
      listing_price_history: {
        Args: { p_key: string }
        Returns: {
          list_price: number
          observed_at: string
          standard_status: string
        }[]
      }
      listing_sold_detail: {
        Args: { p_key: string }
        Returns: {
          close_date: string
          close_price: number
          cumulative_days_on_market: number
          original_list_price: number
        }[]
      }
      mark_alerts_seen: { Args: never; Returns: number }
      mark_lead_replied: { Args: { p_lead: string }; Returns: undefined }
      mark_messages_read: { Args: { p_member: string }; Returns: number }
      mark_staff_notifications_read: { Args: { p_ids?: number[] }; Returns: number }
      market_stats: { Args: { p_months?: number; p_slug: string }; Returns: Json }
      mls_last_updated: { Args: never; Returns: string }
      mls_sync_health: {
        Args: never
        Returns: {
          last_failure_at: string
          last_status: Database["public"]["Enums"]["mls_sync_status"]
          last_success_at: string
          stale: boolean
        }[]
      }
      my_tour_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          listing_key: string
          message: string
          payload: Json
          tour_confirmed_at: string
          tour_status: Database["public"]["Enums"]["tour_status"]
        }[]
      }
      notification_sweep: { Args: never; Returns: Json }
      open_house_signin_info: {
        Args: { p_token: string }
        Returns: {
          accepting: boolean
          city: string
          end_time: string
          listing_key: string
          open_house_key: string
          start_time: string
          street: string
        }[]
      }
      open_house_signin_link: { Args: { p_open_house_key: string }; Returns: string }
      public_city_stats: { Args: { p_slug: string }; Returns: Json }
      public_own_sold: {
        Args: { p_limit?: number }
        Returns: {
          bathrooms_total: number
          bedrooms_total: number
          city: string
          close_date: string
          close_price: number
          listing_key: string
          postal_code: string
          property_sub_type: string
          street: string
        }[]
      }
      publish_content: { Args: { p_revision: string }; Returns: string }
      purge_member_alert_data: { Args: { p_all?: boolean }; Returns: Json }
      purge_old_leads: { Args: { p_months?: number }; Returns: number }
      reassign_lead: { Args: { p_agent: string; p_lead: string }; Returns: undefined }
      record_listing_view: { Args: { p_key: string; p_listing_key: string; p_visitor: string }; Returns: boolean }
      reject_content: { Args: { p_note: string; p_revision: string }; Returns: undefined }
      release_notification: { Args: { p_id: string; p_permanent?: boolean; p_reason: string }; Returns: string }
      request_account_deletion: { Args: never; Returns: string }
      run_member_alerts: { Args: { p_now?: string }; Returns: Json }
      save_content_draft: { Args: { p_body: Json; p_key: string; p_revision: string; p_table: Database["public"]["Enums"]["content_table"] }; Returns: string }
      search_listings: {
        Args: {
          p_bbox?: number[]
          p_cities?: string[]
          p_limit?: number
          p_max_price?: number
          p_min_baths?: number
          p_min_beds?: number
          p_min_price?: number
          p_offset?: number
          p_open_houses_only?: boolean
          p_own_only?: boolean
          p_sort?: string
          p_sub_types?: string[]
        }
        Returns: {
          address_display: boolean
          bathrooms_total: number
          bedrooms_total: number
          city: string
          is_own_listing: boolean
          latitude: number
          list_office_name: string
          list_price: number
          listing_id: string
          listing_key: string
          living_area: number
          longitude: number
          modification_ts: string
          next_open_house_end: string
          next_open_house_start: string
          on_market_date: string
          photo_storage_path: string
          photo_url: string
          postal_code: string
          property_sub_type: string
          property_type: string
          standard_status: string
          street: string
          total_count: number
        }[]
      }
      search_sold_listings: {
        Args: {
          p_bbox?: number[]
          p_cities?: string[]
          p_closed_within_days?: number
          p_limit?: number
          p_max_price?: number
          p_min_baths?: number
          p_min_beds?: number
          p_min_price?: number
          p_offset?: number
          p_sub_types?: string[]
        }
        Returns: {
          address_display: boolean
          bathrooms_total: number
          bedrooms_total: number
          city: string
          close_date: string
          close_price: number
          is_own_listing: boolean
          list_office_name: string
          listing_id: string
          listing_key: string
          living_area: number
          photo_storage_path: string
          photo_url: string
          postal_code: string
          property_sub_type: string
          property_type: string
          street: string
          total_count: number
        }[]
      }
      seller_weekly_report_data: { Args: { p_deal: string; p_week_start?: string }; Returns: Json }
      send_seller_weekly_report: { Args: { p_deal: string; p_week_start?: string }; Returns: number }
      set_alert_emails: { Args: { p_on: boolean }; Returns: undefined }
      set_buyer_agreement: { Args: { p_member: string; p_on_file: boolean }; Returns: undefined }
      set_lead_admin_away: { Args: { p_away: boolean; p_until?: string }; Returns: undefined }
      set_lead_routing: {
        Args: { p_backup_admin: string; p_escalation_minutes?: number; p_flood_cap?: number; p_lead_admin: string }
        Returns: undefined
      }
      set_lead_status: { Args: { p_lead: string; p_reason?: string; p_status: string }; Returns: undefined }
      set_member_agent: { Args: { p_agent: string; p_member: string }; Returns: undefined }
      set_member_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      set_mls_sync_live: { Args: { p_live: boolean }; Returns: undefined }
      set_tour_status: {
        Args: { p_lead: string; p_status: Database["public"]["Enums"]["tour_status"] }
        Returns: undefined
      }
      storage_deal_id: { Args: { object_name: string }; Returns: string }
      storage_member_id: { Args: { object_name: string }; Returns: string }
      submit_content: { Args: { p_revision: string }; Returns: undefined }
      submit_open_house_signin: {
        Args: {
          p_consent_contact: boolean
          p_email: string
          p_has_agent: string
          p_name: string
          p_phone: string
          p_token: string
        }
        Returns: undefined
      }
      unpublish_content: { Args: { p_key: string; p_table: Database["public"]["Enums"]["content_table"] }; Returns: undefined }
      unsubscribe_alert_emails: { Args: { p_token: string }; Returns: boolean }
      update_my_profile: {
        Args: { p_full_name: string; p_phone: string | null }
        Returns: undefined
      }
      verify_agent_access: { Args: { p_email: string; p_office: string; p_profile: string }; Returns: Json }
    }
    Enums: {
      alert_frequency: "instant" | "daily" | "off"
      alert_kind: "new_match" | "back_on_market" | "price_drop" | "price_change" | "status_change"
      city_kind: "city" | "unincorporated"
      content_table: "city_guides" | "posts" | "testimonials"
      deal_member_role: "seller" | "agent" | "va" | "tc"
      deal_status: "active" | "closed" | "cancelled"
      deletion_request_status: "pending" | "completed" | "cancelled"
      lead_kind: "contact" | "valuation" | "tour" | "transform" | "newsletter" | "open_house_signin"
      mls_data_level: "IDX" | "VOW" | "FULL"
      mls_sync_kind: "incremental" | "reconcile" | "purge"
      mls_sync_status: "running" | "succeeded" | "failed"
      notification_status: "scheduled" | "sent" | "cancelled" | "failed"
      post_kind: "insight" | "news" | "event" | "market_update"
      receipt_source: "drive" | "dropbox" | "manual"
      revision_status: "draft" | "submitted" | "rejected" | "published"
      seller_type: "normal" | "trust" | "successor_trustee" | "probate"
      task_phase: "after_ratification" | "closing_week" | "after_coe"
      tour_status: "requested" | "confirmed" | "declined" | "completed" | "cancelled"
      user_role: "admin" | "agent" | "va" | "tc" | "seller" | "buyer" | "both"
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
      alert_frequency: ["instant", "daily", "off"],
      alert_kind: ["new_match", "back_on_market", "price_drop", "price_change", "status_change"],
      city_kind: ["city", "unincorporated"],
      content_table: ["city_guides", "posts", "testimonials"],
      deal_member_role: ["seller", "agent", "va", "tc"],
      deal_status: ["active", "closed", "cancelled"],
      deletion_request_status: ["pending", "completed", "cancelled"],
      lead_kind: ["contact", "valuation", "tour", "transform", "newsletter", "open_house_signin"],
      mls_data_level: ["IDX", "VOW", "FULL"],
      mls_sync_kind: ["incremental", "reconcile", "purge"],
      mls_sync_status: ["running", "succeeded", "failed"],
      notification_status: ["scheduled", "sent", "cancelled", "failed"],
      post_kind: ["insight", "news", "event", "market_update"],
      receipt_source: ["drive", "dropbox", "manual"],
      revision_status: ["draft", "submitted", "rejected", "published"],
      seller_type: ["normal", "trust", "successor_trustee", "probate"],
      task_phase: ["after_ratification", "closing_week", "after_coe"],
      tour_status: ["requested", "confirmed", "declined", "completed", "cancelled"],
      user_role: ["admin", "agent", "va", "tc", "seller", "buyer", "both"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
