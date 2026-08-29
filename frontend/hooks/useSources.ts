"use client";

import { useCallback, useEffect, useState } from "react";
import { listSources, putSource } from "../lib/db";
import { Source } from "../lib/types";

export function useSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const refresh = useCallback(async () => setSources(await listSources()), []);
  useEffect(() => {
    let active = true;
    void listSources().then((value) => { if (active) setSources(value); });
    window.addEventListener("expense-data-changed", refresh);
    return () => { active = false; window.removeEventListener("expense-data-changed", refresh); };
  }, [refresh]);
  const update = useCallback(async (source: Source) => {
    await putSource(source);
    await refresh();
    window.dispatchEvent(new Event("expense-data-changed"));
  }, [refresh]);
  return { sources, refresh, update };
}
