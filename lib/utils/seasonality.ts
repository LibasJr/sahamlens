export interface MonthlyReturnData {
  year: number;
  months: (number | null)[]; // 12 elements (index 0 = Jan, index 11 = Dec), null if no data
}

export interface SeasonalitySummary {
  matrix: MonthlyReturnData[];
  monthAverages: (number | null)[]; // 12 elements (average % return per month)
  monthWinRates: (number | null)[]; // 12 elements (% of positive months)
  monthCounts: number[]; // 12 elements (number of sample years with data)
  bestMonth: { monthIndex: number; monthName: string; avgReturn: number } | null;
  worstMonth: { monthIndex: number; monthName: string; avgReturn: number } | null;
}

export const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

export function calculateMonthlySeasonality(
  candles: { date?: string | number | Date; time?: string | number; close: number }[]
): SeasonalitySummary {
  if (!candles || candles.length === 0) {
    return {
      matrix: [],
      monthAverages: Array(12).fill(null),
      monthWinRates: Array(12).fill(null),
      monthCounts: Array(12).fill(0),
      bestMonth: null,
      worstMonth: null,
    };
  }

  // 1. Parse and sort candles chronologically
  const parsed = candles
    .map((c) => {
      let d: Date;
      if (c.date) {
        d = new Date(c.date);
      } else if (c.time) {
        d = typeof c.time === 'number' ? new Date(c.time * 1000) : new Date(c.time);
      } else {
        return null;
      }
      if (isNaN(d.getTime()) || typeof c.close !== 'number' || isNaN(c.close) || c.close <= 0) {
        return null;
      }
      return { date: d, close: c.close };
    })
    .filter((c): c is { date: Date; close: number } => c !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (parsed.length === 0) {
    return {
      matrix: [],
      monthAverages: Array(12).fill(null),
      monthWinRates: Array(12).fill(null),
      monthCounts: Array(12).fill(0),
      bestMonth: null,
      worstMonth: null,
    };
  }

  // 2. Group by year-month to find first and last close of each month
  const monthMap = new Map<string, { year: number; month: number; firstClose: number; lastClose: number }>();

  for (const c of parsed) {
    const year = c.date.getFullYear();
    const month = c.date.getMonth(); // 0-11
    const key = `${year}-${String(month).padStart(2, '0')}`;

    const existing = monthMap.get(key);
    if (!existing) {
      monthMap.set(key, { year, month, firstClose: c.close, lastClose: c.close });
    } else {
      existing.lastClose = c.close; // update with latest candle in this month
    }
  }

  // 3. Sort month keys chronologically to compute month-over-month returns accurately
  const sortedMonthKeys = Array.from(monthMap.keys()).sort();
  const returnMap = new Map<string, number>();

  for (let i = 0; i < sortedMonthKeys.length; i++) {
    const key = sortedMonthKeys[i];
    const current = monthMap.get(key)!;
    const prevKey = sortedMonthKeys[i - 1];
    const prev = prevKey ? monthMap.get(prevKey) : null;

    let ret: number;
    // If previous month exists in continuous sequence, use prev month's last close
    if (prev) {
      ret = ((current.lastClose - prev.lastClose) / prev.lastClose) * 100;
    } else {
      // First month: return within the month
      ret = ((current.lastClose - current.firstClose) / current.firstClose) * 100;
    }

    returnMap.set(key, parseFloat(ret.toFixed(2)));
  }

  // 4. Build Matrix by Year (from newest year down to oldest, up to 10 years)
  const years = Array.from(new Set(Array.from(monthMap.values()).map((v) => v.year))).sort((a, b) => b - a);

  const matrix: MonthlyReturnData[] = years.map((year) => {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      months.push(returnMap.has(key) ? returnMap.get(key)! : null);
    }
    return { year, months };
  });

  // 5. Calculate monthly averages and win rates across years
  const monthAverages: (number | null)[] = [];
  const monthWinRates: (number | null)[] = [];
  const monthCounts: number[] = [];

  for (let m = 0; m < 12; m++) {
    const values: number[] = [];
    for (const row of matrix) {
      const val = row.months[m];
      if (val !== null && !isNaN(val)) {
        values.push(val);
      }
    }

    monthCounts.push(values.length);
    if (values.length === 0) {
      monthAverages.push(null);
      monthWinRates.push(null);
    } else {
      const sum = values.reduce((acc, v) => acc + v, 0);
      const avg = sum / values.length;
      const wins = values.filter((v) => v > 0).length;
      const winRate = (wins / values.length) * 100;

      monthAverages.push(parseFloat(avg.toFixed(2)));
      monthWinRates.push(parseFloat(winRate.toFixed(1)));
    }
  }

  // 6. Find best and worst months
  let bestMonth: SeasonalitySummary['bestMonth'] = null;
  let worstMonth: SeasonalitySummary['worstMonth'] = null;

  monthAverages.forEach((avg, idx) => {
    if (avg !== null && monthCounts[idx] >= 2) {
      if (!bestMonth || avg > bestMonth.avgReturn) {
        bestMonth = { monthIndex: idx, monthName: MONTH_NAMES_SHORT[idx], avgReturn: avg };
      }
      if (!worstMonth || avg < worstMonth.avgReturn) {
        worstMonth = { monthIndex: idx, monthName: MONTH_NAMES_SHORT[idx], avgReturn: avg };
      }
    }
  });

  return {
    matrix,
    monthAverages,
    monthWinRates,
    monthCounts,
    bestMonth,
    worstMonth,
  };
}
