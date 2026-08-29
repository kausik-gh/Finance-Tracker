import { DBSchema, IDBPDatabase, openDB } from "idb";
import { BalanceHistory, Source, Transaction, User } from "./types";
import { CategoryMapping } from "./merchant-intelligence";

type MetaValue = string | User | CategoryMapping | null;
export type CategoryMappingRecord = {
  id: string;
  user_id: string;
  merchant_key: string;
  category: string;
  updated_at: string;
  sync_status: "synced" | "pending";
};

interface ExpenseDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: { "by-date": string; "by-category": string; "by-user": string };
  };
  sources: { key: string; value: Source; indexes: { "by-user": string } };
  balance_history: { key: string; value: BalanceHistory; indexes: { "by-user": string } };
  meta: { key: string; value: { key: string; value: MetaValue } };
  category_mappings: {
    key: string;
    value: CategoryMappingRecord;
    indexes: { "by-user": string };
  };
}

let database: Promise<IDBPDatabase<ExpenseDB>> | undefined;

export function getDB() {
  if (typeof window === "undefined") return undefined;
  database ??= openDB<ExpenseDB>("expense-tracker", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const transactions = db.createObjectStore("transactions", { keyPath: "id" });
        transactions.createIndex("by-date", "transaction_date");
        transactions.createIndex("by-category", "category");
        transactions.createIndex("by-user", "user_id");
        const sources = db.createObjectStore("sources", { keyPath: "id" });
        sources.createIndex("by-user", "user_id");
        const history = db.createObjectStore("balance_history", { keyPath: "id" });
        history.createIndex("by-user", "user_id");
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (oldVersion < 2) {
        const mappings = db.createObjectStore("category_mappings", { keyPath: "id" });
        mappings.createIndex("by-user", "user_id");
      }
    },
  });
  return database;
}

export async function getMeta<T extends MetaValue>(key: string): Promise<T | undefined> {
  const db = getDB();
  if (!db) return undefined;
  return (await db).get("meta", key).then((item) => item?.value as T | undefined);
}

export async function setMeta(key: string, value: MetaValue) {
  const db = getDB();
  if (db) await (await db).put("meta", { key, value });
}

export async function clearLocalData() {
  const db = getDB();
  if (!db) return;
  const instance = await db;
  const tx = instance.transaction(["transactions", "sources", "balance_history", "meta", "category_mappings"], "readwrite");
  await Promise.all([
    tx.objectStore("transactions").clear(),
    tx.objectStore("sources").clear(),
    tx.objectStore("balance_history").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("category_mappings").clear(),
  ]);
  await tx.done;
}

export async function listTransactions() {
  const db = getDB();
  return db ? (await db).getAll("transactions") : [];
}

export async function listSources() {
  const db = getDB();
  return db ? (await db).getAll("sources") : [];
}

export async function listBalanceHistory() {
  const db = getDB();
  return db ? (await db).getAll("balance_history") : [];
}

export async function putTransaction(transaction: Transaction) {
  const db = getDB();
  if (db) await (await db).put("transactions", transaction);
}

export async function replaceTransactionWithSplits(originalId: string, splits: Transaction[]) {
  const db = getDB();
  if (!db) return;
  const instance = await db;
  const tx = instance.transaction("transactions", "readwrite");
  await tx.store.delete(originalId);
  await Promise.all(splits.map((transaction) => tx.store.put(transaction)));
  await tx.done;
}

export async function putSource(source: Source) {
  const db = getDB();
  if (db) await (await db).put("sources", source);
}

export async function listCategoryMappings(userId: string) {
  const db = getDB();
  return db ? (await db).getAllFromIndex("category_mappings", "by-user", userId) : [];
}

export async function putCategoryMapping(mapping: CategoryMappingRecord) {
  const db = getDB();
  if (db) await (await db).put("category_mappings", mapping);
}

export async function putMany<T extends "transactions" | "sources" | "balance_history">(
  store: T,
  values: ExpenseDB[T]["value"][],
) {
  const db = getDB();
  if (!db || values.length === 0) return;
  const instance = await db;
  const tx = instance.transaction(store, "readwrite");
  await Promise.all(values.map((value) => tx.store.put(value)));
  await tx.done;
}
