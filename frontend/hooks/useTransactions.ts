"use client";

import { useCallback, useEffect, useState } from "react";
import { listTransactions, putTransaction } from "../lib/db";
import { Transaction } from "../lib/types";

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const refresh = useCallback(async () => setTransactions(await listTransactions()), []);
  useEffect(() => {
    let active = true;
    void listTransactions().then((value) => { if (active) setTransactions(value); });
    window.addEventListener("expense-data-changed", refresh);
    return () => { active = false; window.removeEventListener("expense-data-changed", refresh); };
  }, [refresh]);
  const update = useCallback(async (transaction: Transaction) => {
    await putTransaction(transaction);
    await refresh();
    window.dispatchEvent(new Event("expense-data-changed"));
  }, [refresh]);
  return { transactions, refresh, update };
}
