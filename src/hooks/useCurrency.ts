import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EXCHANGE_RATES_EVENT,
  buildRateGraph,
  convertWithGraph,
  ensureDefaultExchangeRates,
  getAllExchangeRates,
  getFobSourceCurrency,
  type RateGraph,
} from "@/domain/db";
import type { ExchangeRate } from "@/domain/types";

/** 多币种汇率全局状态：任意货币对 + 图路径换算 + FOB 录入币种 */
export function useCurrency() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [fobCurrency, setFobCurrency] = useState<string>("CNY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      await ensureDefaultExchangeRates();
      const [rows, fob] = await Promise.all([getAllExchangeRates(), getFobSourceCurrency()]);
      setRates(rows);
      setFobCurrency(fob);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const handler = () => reload();
    window.addEventListener(EXCHANGE_RATES_EVENT, handler);
    return () => window.removeEventListener(EXCHANGE_RATES_EVENT, handler);
  }, [reload]);

  const graph = useMemo<RateGraph>(() => buildRateGraph(rates), [rates]);

  const convert = useCallback(
    (amount: number, from: string, to: string): number | null =>
      convertWithGraph(amount, from, to, graph),
    [graph]
  );

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const r of rates) {
      set.add(r.from);
      set.add(r.to);
    }
    return [...set].sort();
  }, [rates]);

  return { rates, graph, currencies, fobCurrency, loading, error, convert, reload };
}
