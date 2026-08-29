"use client";

import { Ban, GitBranch, Plus, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { DivideTransactionSheet } from "../components/DivideTransactionSheet";
import { CategoryPickerSheet } from "../components/CategoryPickerSheet";
import { AddTransactionSheet } from "../components/AddTransactionSheet";
import { MonthSelector } from "../components/MonthSelector";
import { ProfileMenu } from "../components/ProfileMenu";
import { TransactionCard } from "../components/TransactionCard";
import { TransactionDetailSheet } from "../components/TransactionDetailSheet";
import { useAuth } from "../hooks/useAuth";
import { useSources } from "../hooks/useSources";
import { useTransactions } from "../hooks/useTransactions";
import { categories } from "../lib/categories";
import { getMeta, listCategoryMappings, putCategoryMapping, replaceTransactionWithSplits, setMeta } from "../lib/db";
import { categoryFrequency, categorySuggestion, CategoryMapping, orderedCategorySuggestions } from "../lib/merchant-intelligence";
import { syncData } from "../lib/sync";
import { Transaction } from "../lib/types";

export default function Home() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sheet, setSheet] = useState<"add" | "category" | "detail" | "divide" | null>(null);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [longPressMenu, setLongPressMenu] = useState<{ transaction: Transaction; x: number; y: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryMappings, setCategoryMappings] = useState<CategoryMapping>({});
  const { user, setUser } = useAuth();
  const { sources } = useSources();
  const { transactions, update } = useTransactions();
  useEffect(() => {
    if (!user) return;
    void Promise.all([
      listCategoryMappings(user.id),
      getMeta<CategoryMapping>("merchant_category_mappings"),
    ]).then(([records, legacy]) => {
      const next = {
        ...(legacy ?? {}),
        ...Object.fromEntries(records.map((item) => [item.merchant_key, item.category])),
      };
      setCategoryMappings(next);
      void Promise.all(Object.entries(legacy ?? {}).map(([merchantKey, category]) => putCategoryMapping({
        id: `${user.id}:${merchantKey}`,
        user_id: user.id,
        merchant_key: merchantKey,
        category,
        updated_at: new Date().toISOString(),
        sync_status: "pending",
      })));
    });
  }, [user]);
  const monthTransactions = useMemo(() => transactions.filter((item) => { const date = new Date(item.transaction_date); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); }).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)), [transactions, month]);
  const cashFlowMonthTransactions = useMemo(() => monthTransactions.filter((item) => !item.excludedFromCashFlow), [monthTransactions]);
  const grouped = monthTransactions.reduce<Record<string, Transaction[]>>((acc, item) => { const key = item.transaction_date.slice(0, 10); (acc[key] ??= []).push(item); return acc; }, {});
  const incoming = cashFlowMonthTransactions.filter((item) => item.type === "credit").reduce((sum, item) => sum + Number(item.amount), 0);
  const outgoing = cashFlowMonthTransactions.filter((item) => item.type === "debit").reduce((sum, item) => sum + Number(item.amount), 0);
  const refreshLatestTransactions = async () => {
    setRefreshing(true);
    try {
      await syncData();
      window.dispatchEvent(new Event("expense-data-changed"));
    } finally {
      setRefreshing(false);
    }
  };
  const learnCategory = (merchant: string, category: string) => {
    const next = { ...categoryMappings, [merchant.trim().toLowerCase()]: category };
    setCategoryMappings(next);
    void setMeta("merchant_category_mappings", next);
    if (user) void putCategoryMapping({
      id: `${user.id}:${merchant.trim().toLowerCase()}`,
      user_id: user.id,
      merchant_key: merchant.trim().toLowerCase(),
      category,
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    });
  };
  const editCategory = async (category: string) => {
    if (selected) {
      await update({ ...selected, category, sync_status: "pending", updated_at: new Date().toISOString() });
      if (selected.merchant) learnCategory(selected.merchant, category);
      setSelected(null);
      setSheet(null);
    }
  };
  const toggleCashFlow = async () => {
    if (!longPressMenu) return;
    await update({ ...longPressMenu.transaction, excludedFromCashFlow: !longPressMenu.transaction.excludedFromCashFlow, sync_status: "pending", updated_at: new Date().toISOString() });
    setLongPressMenu(null);
  };
  const divideTransaction = async (amounts: number[]) => {
    if (!selected) return;
    const timestamp = Date.now();
    const splits = amounts.map((amount, index) => ({
      ...selected,
      id: crypto.randomUUID(),
      unique_ref: `${selected.unique_ref}-split-${timestamp}-${index + 1}`,
      amount,
      sync_status: "pending" as const,
      updated_at: new Date().toISOString(),
    }));
    await replaceTransactionWithSplits(selected.id, splits);
    window.dispatchEvent(new Event("expense-data-changed"));
    setSelected(null);
    setSheet(null);
  };
  const selectedCategorySuggestions = selected
    ? orderedCategorySuggestions(
      categoryFrequency(transactions),
      categorySuggestion(selected.merchant ?? "", selected.amount, selected.type, categoryMappings),
      categories.map((item) => item.name),
    )
    : [];
  return <main className="mx-auto min-h-screen max-w-2xl overflow-x-hidden px-4 pb-32 pt-2 sm:px-5">
    <header className="relative mb-4 flex justify-center"><MonthSelector month={month} onChange={setMonth} /><div className="absolute right-0 top-0"><ProfileMenu user={user} onChange={setUser} /></div></header>
    <section className="space-y-8">
      <div className="glass flex items-center justify-between rounded-full px-6 py-4 text-sm"><span className="text-[#8E8E93]">Incoming: <strong className="text-[#30D158]">₹{incoming.toLocaleString("en-IN")}</strong></span><span className="text-[#8E8E93]">Outgoing: <strong className="text-[#FF453A]">₹{outgoing.toLocaleString("en-IN")}</strong></span></div>
      <div className="space-y-6">{Object.entries(grouped).map(([date, items]) => <section key={date}><div className="mb-3 flex items-center gap-3 text-sm font-semibold"><span>{new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><div className="h-px flex-1 bg-white/10" /></div><div className="space-y-3">{items.map((item) => <TransactionCard key={item.id} transaction={item} onCategory={() => { setSelected(item); setSheet("category"); }} onDetail={() => { setSelected(item); setSheet("detail"); }} onLongPress={({ x, y }) => setLongPressMenu({ transaction: item, x: Math.min(x, document.documentElement.clientWidth - 232), y: Math.min(y, document.documentElement.clientHeight - 112) })} />)}</div></section>)}</div>
      {monthTransactions.length === 0 && <div className="py-24 text-center text-[#8E8E93]">No transactions for this month.</div>}
    </section>
    <div className="fixed bottom-24 right-5 z-30 flex items-center gap-3">
      <button aria-label="Refresh transactions" onClick={() => void refreshLatestTransactions()} disabled={refreshing} className="glass flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_0_24px_rgba(255,255,255,.1)] transition-transform duration-150 active:scale-[0.96] disabled:opacity-50">
        <RefreshCw size={18} className={refreshing ? "animate-spin" : undefined} />
      </button>
      <button aria-label="Add transaction" onClick={() => setSheet("add")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-[0_0_24px_rgba(255,255,255,.1)] transition-transform duration-150 active:scale-[0.96]"><Plus size={22} /></button>
    </div>
    <BottomNav />
    {sheet === "add" && <AddTransactionSheet sources={sources} month={month} transactions={transactions} categoryMappings={categoryMappings} userId={user?.id ?? ""} onLearnCategory={learnCategory} onClose={() => setSheet(null)} />}
    {sheet === "category" && selected && <CategoryPickerSheet value={selected.category} type={selected.type} suggestions={selectedCategorySuggestions} onSelect={editCategory} onClose={() => setSheet(null)} />}
    {sheet === "detail" && selected && <TransactionDetailSheet transaction={selected} transactions={transactions} categoryMappings={categoryMappings} onLearnCategory={learnCategory} onSave={update} onClose={() => setSheet(null)} />}
    {sheet === "divide" && selected && <DivideTransactionSheet transaction={selected} onSave={divideTransaction} onClose={() => setSheet(null)} />}
    {longPressMenu && <><div className="fixed inset-0 z-59" onPointerDown={() => setLongPressMenu(null)} /><div className="fixed z-60 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#2c2c2e] p-1 shadow-2xl" style={{ left: longPressMenu.x, top: longPressMenu.y }}><button type="button" onClick={() => void toggleCashFlow()} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/10">{longPressMenu.transaction.excludedFromCashFlow ? <Undo2 size={16} /> : <Ban size={16} />}{longPressMenu.transaction.excludedFromCashFlow ? "Include in cash flow" : "Exclude from cash flow"}</button><button type="button" onClick={() => { setSelected(longPressMenu.transaction); setSheet("divide"); setLongPressMenu(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/10"><GitBranch size={16} />Divide transaction</button></div></>}
  </main>;
}
