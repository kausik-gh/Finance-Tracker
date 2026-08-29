import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { categories } from "../lib/categories";
import { CategoryMapping, categoryFrequency, orderedCategorySuggestions } from "../lib/merchant-intelligence";
import { Transaction } from "../lib/types";
import { CategoryPickerSheet } from "./CategoryPickerSheet";
import { Sheet } from "./Sheet";

export function TransactionDetailSheet({
  transaction,
  transactions,
  categoryMappings,
  onLearnCategory,
  onSave,
  onClose,
}: {
  transaction: Transaction;
  transactions: Transaction[];
  categoryMappings: CategoryMapping;
  onLearnCategory: (merchant: string, category: string) => void;
  onSave: (transaction: Transaction) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [merchant, setMerchant] = useState(transaction.merchant ?? "");
  const [amount, setAmount] = useState(String(transaction.amount));
  const [type, setType] = useState(transaction.type);
  const [category, setCategory] = useState(transaction.category);
  const [date, setDate] = useState(transaction.transaction_date.slice(0, 10));
  const [source, setSource] = useState(transaction.source ?? "");
  const [description, setDescription] = useState(transaction.description ?? "");
  const [balanceAfter, setBalanceAfter] = useState(transaction.balance_after == null ? "" : String(transaction.balance_after));
  const suggestions = orderedCategorySuggestions(
    categoryFrequency(transactions),
    categoryMappings[merchant.trim().toLowerCase()] ?? null,
    categories.map((item) => item.name),
  );
  const save = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !date) return;
    const next: Transaction = {
      ...transaction,
      merchant: merchant.trim() || null,
      amount: numericAmount,
      type,
      category,
      transaction_date: new Date(`${date}T12:00:00`).toISOString(),
      source: source.trim() || null,
      description: description.trim() || null,
      balance_after: balanceAfter.trim() ? Number(balanceAfter) : null,
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    };
    await onSave(next);
    if (next.merchant && next.category) onLearnCategory(next.merchant, next.category);
    setEditing(false);
  };
  if (!editing) {
    const rows = [["Merchant", transaction.merchant || "—"], ["Amount", `₹${transaction.amount.toLocaleString("en-IN")}`], ["Type", transaction.type], ["Category", transaction.category || "—"], ["Date", new Date(transaction.transaction_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })], ["Source", transaction.source || "—"], ["Balance after", transaction.balance_after == null ? "—" : `₹${transaction.balance_after.toLocaleString("en-IN")}`]];
    return <Sheet title="Transaction details" onClose={onClose}><div className="space-y-4">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-6 border-b border-white/10 pb-3 text-sm"><span className="text-[#8E8E93]">{label}</span><span className={label === "Amount" ? transaction.type === "credit" ? "text-[#30D158]" : "text-(--red)" : "text-right"}>{value}</span></div>)}<div className="pt-2 text-xs text-[#8E8E93]"><p>Description: {transaction.description || "—"}</p><p className="mt-2">Reference: {transaction.unique_ref}</p></div><button onClick={() => setEditing(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-black"><Pencil size={16} />Edit transaction</button></div></Sheet>;
  }
  return <Sheet title="Edit transaction" onClose={onClose}>
    <div className="space-y-4">
      <input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Merchant or counterparty" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <div className="grid grid-cols-2 rounded-full bg-black/20 p-1">{(["credit", "debit"] as const).map((option) => <button key={option} onClick={() => setType(option)} className={`rounded-full py-2 text-sm capitalize ${type === option ? "bg-white/10 text-white" : "text-[#8E8E93]"}`}>{option}</button>)}</div>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="glass w-full rounded-2xl px-4 py-4 text-white outline-none" />
      <button onClick={() => setShowCategories(true)} className="glass w-full rounded-2xl p-4 text-left text-sm">{category || "Choose category"}</button>
      <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Source" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <input type="number" step="0.01" value={balanceAfter} onChange={(event) => setBalanceAfter(event.target.value)} placeholder="Balance after (optional)" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <button onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-black"><Check size={16} />Save changes</button>
    </div>
    {showCategories && <CategoryPickerSheet value={category} type={type} suggestions={suggestions} onSelect={setCategory} onClose={() => setShowCategories(false)} />}
  </Sheet>;
}
