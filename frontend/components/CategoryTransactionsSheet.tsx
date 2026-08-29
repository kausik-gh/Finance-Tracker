"use client";

import { Transaction } from "../lib/types";
import { Sheet } from "./Sheet";

export function CategoryTransactionsSheet({ category, transactions, onClose }: { category: string; transactions: Transaction[]; onClose: () => void }) {
  return <Sheet title={`${category} spending`} onClose={onClose}>
    {transactions.length === 0 ? <p className="py-8 text-center text-sm text-[#8E8E93]">No spending in this period.</p> : <div className="space-y-3">{transactions.map((transaction) => <div key={transaction.id} className="glass rounded-2xl p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-medium">{transaction.merchant || "Unknown"}</p><p className="mt-1 text-xs text-[#8E8E93]">{new Date(transaction.transaction_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p></div><span className="font-semibold text-[var(--red)]">₹{Number(transaction.amount).toLocaleString("en-IN")}</span></div></div>)}</div>}
  </Sheet>;
}
