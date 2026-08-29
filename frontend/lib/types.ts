export type TransactionType = "debit" | "credit";
export type SyncStatus = "synced" | "pending";
export type IconType = "gpay" | "cash" | "visa" | "mastercard" | "bank" | "other";

export type Transaction = {
  id: string;
  user_id: string;
  unique_ref: string;
  transaction_date: string;
  amount: number;
  type: TransactionType;
  merchant: string | null;
  category: string | null;
  description: string | null;
  balance_after: number | null;
  source: string | null;
  email_timestamp?: string | null;
  excludedFromCashFlow?: boolean;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
};

export type Source = {
  id: string;
  user_id: string;
  source_name: string;
  icon_type: IconType;
  balance: number;
  updated_at: string;
  sync_status: SyncStatus;
};

export type BalanceHistory = {
  id: string;
  user_id: string;
  snapshot_date: string;
  balance: number;
  email_timestamp?: string | null;
};

export type User = { id: string; email: string; display_name: string | null };
