// Hand-written to mirror supabase/migrations. Replace with the output of
// `supabase gen types typescript --local` once a local/hosted project is wired up.

export type UserRole = "admin" | "agent" | "va" | "tc" | "seller" | "buyer";
export type SellerType = "normal" | "trust" | "successor_trustee" | "probate";
export type DealStatus = "active" | "closed" | "cancelled";
export type TaskPhase = "after_ratification" | "closing_week" | "after_coe";
export type DealMemberRole = "seller" | "agent" | "va" | "tc";
export type ReceiptSource = "drive" | "dropbox" | "manual";
export type NotificationStatus = "scheduled" | "sent" | "cancelled" | "failed";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  address: string;
  escrow_number: string | null;
  seller_name: string | null;
  seller_type: SellerType;
  ratification_date: string;
  days_to_close: number;
  rent_back_days: number;
  sale_price: number | null;
  status: DealStatus;
  agent_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DealMember {
  deal_id: string;
  profile_id: string;
  member_role: DealMemberRole;
  created_at: string;
}

export interface DealContingency {
  id: string;
  deal_id: string;
  kind: string;
  offset_days: number;
  due_date: string | null;
  removed_at: string | null;
}

export interface Task {
  id: string;
  deal_id: string;
  title: string;
  owner: string;
  phase: TaskPhase;
  offset_days: number;
  due_date: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  preferred: boolean;
  created_at: string;
}

export interface DealVendor {
  deal_id: string;
  vendor_id: string;
  confirmed: boolean;
  created_at: string;
}

export interface Receipt {
  id: string;
  deal_id: string;
  vendor: string;
  receipt_date: string;
  amount: number;
  category: string;
  source: ReceiptSource;
  storage_path: string | null;
  created_by: string;
  created_at: string;
}

export interface Notification {
  id: string;
  deal_id: string | null;
  recipient_profile_id: string | null;
  recipient_email: string | null;
  template_key: string;
  payload: Json;
  send_at: string;
  sent_at: string | null;
  status: NotificationStatus;
  created_at: string;
}

export interface InboundEmail {
  id: string;
  source: string;
  raw: Json;
  parsed_ok: boolean;
  received_at: string;
}

export interface TrackedProperty {
  id: string;
  buyer_id: string;
  address: string;
  source: string | null;
  status: string;
  created_at: string;
}

export interface PropertyEvent {
  id: string;
  tracked_property_id: string;
  kind: string;
  payload: Json;
  source_email_id: string | null;
  occurred_at: string;
}

type TableOf<Row, Required extends keyof Row, Generated extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableOf<Profile, "id" | "email", "created_at" | "updated_at">;
      deals: TableOf<Deal, "address" | "ratification_date", "id" | "created_at" | "updated_at">;
      deal_members: TableOf<DealMember, "deal_id" | "profile_id" | "member_role", "created_at">;
      deal_contingencies: TableOf<DealContingency, "deal_id" | "kind" | "offset_days", "id">;
      tasks: TableOf<
        Task,
        "deal_id" | "title" | "owner" | "phase" | "offset_days" | "due_date",
        "id" | "created_at"
      >;
      vendors: TableOf<Vendor, "name" | "role", "id" | "created_at">;
      deal_vendors: TableOf<DealVendor, "deal_id" | "vendor_id", "created_at">;
      receipts: TableOf<
        Receipt,
        "deal_id" | "vendor" | "receipt_date" | "amount",
        "id" | "created_at"
      >;
      notifications: TableOf<
        Notification,
        "template_key" | "send_at",
        "id" | "created_at" | "sent_at"
      >;
      inbound_emails: TableOf<InboundEmail, "source" | "raw", "id" | "received_at">;
      tracked_properties: TableOf<TrackedProperty, "address", "id" | "created_at">;
      property_events: TableOf<
        PropertyEvent,
        "tracked_property_id" | "kind",
        "id" | "occurred_at"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      has_deal_access: { Args: { p_deal_id: string }; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      seller_type: SellerType;
      deal_status: DealStatus;
      task_phase: TaskPhase;
      deal_member_role: DealMemberRole;
      receipt_source: ReceiptSource;
      notification_status: NotificationStatus;
    };
  };
}
