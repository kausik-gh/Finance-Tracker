import {
  listBalanceHistory,
  listCategoryMappings,
  listSources,
  listTransactions,
  putCategoryMapping,
  putMany,
  putSource,
  setMeta,
} from "./db";
import { api } from "./api";
import { checkSession } from "./auth";
import { Source, Transaction } from "./types";

async function json<T>(path: string): Promise<T | null> {
  try {
    const response = await api.get(path);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, data: unknown): Promise<T | null> {
  try {
    const response = await api.post(path, data);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

type SyncResponse = {
  transactions: Transaction[];
  sources: Source[];
  category_mappings: Record<string, string>;
};

export async function syncData() {
  if (!navigator.onLine) return false;
  const user = await checkSession();
  if (!user) return false;
  const localTransactions = await listTransactions();
  const localSources = await listSources();
  const localMappings = await listCategoryMappings(user.id);
  const state = await postJson<SyncResponse>("/api/sync", {
    transactions: localTransactions.filter((item) => item.user_id === user.id && item.sync_status === "pending"),
    sources: localSources.filter((item) => item.user_id === user.id && item.sync_status === "pending"),
    category_mappings: Object.fromEntries(localMappings.map((item) => [item.merchant_key, item.category])),
  });
  if (state) {
    await putMany(
      "transactions",
      state.transactions.map((item) => ({ ...item, sync_status: "synced" as const })),
    );
    await putMany(
      "sources",
      state.sources.map((item) => ({ ...item, sync_status: "synced" as const })),
    );
    await Promise.all(Object.entries(state.category_mappings).map(([merchantKey, category]) => putCategoryMapping({
      id: `${user.id}:${merchantKey}`,
      user_id: user.id,
      merchant_key: merchantKey,
      category,
      updated_at: new Date().toISOString(),
      sync_status: "synced",
    })));
  }
  const [transactions, history] = await Promise.all([
    state ? Promise.resolve(state.transactions) : json<Transaction[]>("/api/transactions?limit=100"),
    json<import("./types").BalanceHistory[]>("/api/balance-history"),
  ]);
  if (transactions && !state) {
    const pendingIds = new Set(localTransactions.filter((item) => item.sync_status === "pending").map((item) => item.id));
    const pendingRefs = new Set(localTransactions.filter((item) => item.sync_status === "pending").map((item) => item.unique_ref));
    await putMany("transactions", transactions
      .filter((item) => !pendingIds.has(item.id) && !pendingRefs.has(item.unique_ref))
      .map((item) => ({ ...item, sync_status: "synced" as const })));
  }
  if (history) await putMany("balance_history", history);
  await ensureUpiSource(user.id, history);
  await setMeta("last_synced_at", new Date().toISOString());
  return Boolean(state);
}

async function ensureUpiSource(userId: string, history: import("./types").BalanceHistory[] | null) {
  const sources = await listSources();
  const existing = sources.find((source) => source.user_id === userId && source.source_name.toLowerCase() === "upi");
  const localHistory = history && history.length > 0 ? history : await listBalanceHistory();
  const latestSnapshot = [...localHistory]
    .filter((snapshot) => snapshot.user_id === userId)
    .sort((left, right) => recordTime(right.email_timestamp ?? right.snapshot_date) - recordTime(left.email_timestamp ?? left.snapshot_date))[0];
  if (!latestSnapshot && existing) return;
  const snapshotTime = latestSnapshot ? recordTime(latestSnapshot.email_timestamp ?? latestSnapshot.snapshot_date) : 0;
  const transactions = await listTransactions();
  const projectedBalance = (latestSnapshot ? Number(latestSnapshot.balance) || 0 : 0) + transactions
    .filter((transaction) => transaction.user_id === userId && recordTime(transaction.email_timestamp ?? transaction.transaction_date) > snapshotTime)
    .reduce((balance, transaction) => {
      const amount = Number(transaction.amount) || 0;
      return balance + (transaction.type === "credit" ? amount : -amount);
    }, 0);
  const upiSource = {
    id: existing?.id ?? `upi-${userId}`,
    user_id: userId,
    source_name: "UPI",
    icon_type: "gpay" as const,
    balance: projectedBalance,
    updated_at: new Date().toISOString(),
    sync_status: "synced" as const,
  };
  await putSource(upiSource);
}

function recordTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
