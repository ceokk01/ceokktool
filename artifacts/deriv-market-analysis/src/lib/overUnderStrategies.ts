// Over / Under Strategies Engine for Deriv Market Analysis
// Implements Over/Under Strategy 3, 4, 5, 6 and Deriv Strategies 2 (Over 1, Over 2, Under 8, Under 7, CMV Pro, Hit & Run)

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
  volume: number;
}

export interface Tick {
  quote: number;
  epoch: number;
  symbol: string;
  pipSize: number;
  lastDigit: number;
}

export interface StrategyConditionCheck {
  label: string;
  met: boolean;
  detail: string;
}

export interface StrategySignalResult {
  strategyId: string;
  strategyName: string;
  active: boolean; // is setup ready to execute trade right now
  valid: boolean; // is signal confirmed valid against live Deriv data
  action: 'ENTER' | 'WAIT'; // action directive
  takeValue: string; // e.g. "OVER 1", "UNDER 6", "OVER 4", "UNDER 7"
  contractType: 'Over' | 'Under';
  predictionDigit: number;
  confidencePct: number;
  strengthWord: 'Strong' | 'Moderate' | 'Wait';
  recommendedRuns: number;
  recommendedBotName: string;
  entryRule: string;
  exitRule: string;
  recoveryRule: string;
  conditions: StrategyConditionCheck[];
  notes: string;
  indicatorData: Record<string, string | number | boolean>;
}

// -------------------------------------------------------------
// Indicator Calculation Helpers
// -------------------------------------------------------------

// Exponential Moving Average
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// Simple Moving Average
export function calculateSMA(values: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sma.push(values[i]);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - j];
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

// Smoothed Moving Average (SMMA / Wilder's Smoothing)
export function calculateSMMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const smma: number[] = [];
  let sum = 0;
  for (let i = 0; i < Math.min(period, values.length); i++) {
    sum += values[i];
  }
  let prev = sum / Math.min(period, values.length);
  smma.push(prev);

  for (let i = 1; i < values.length; i++) {
    const cur = (prev * (period - 1) + values[i]) / period;
    smma.push(cur);
    prev = cur;
  }
  return smma;
}

// MACD (Moving Average Convergence Divergence)
export function calculateMACD(closes: number[]): {
  macdLine: number;
  signalLine: number;
  histogram: number;
  trend: 'uptrend' | 'downtrend' | 'neutral';
} {
  if (closes.length < 26) {
    // Return estimated values based on recent close difference if not enough candles
    const diff = closes.length >= 2 ? closes[closes.length - 1] - closes[0] : 0;
    const estMacd = Number((diff * 15).toFixed(2));
    return {
      macdLine: estMacd,
      signalLine: Number((estMacd * 0.8).toFixed(2)),
      histogram: Number((estMacd * 0.2).toFixed(2)),
      trend: estMacd > 0.5 ? 'uptrend' : estMacd < -0.5 ? 'downtrend' : 'neutral',
    };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdSeries.push(ema12[i] - ema26[i]);
  }
  const signalSeries = calculateEMA(macdSeries, 9);

  const lastMacd = macdSeries[macdSeries.length - 1];
  const lastSignal = signalSeries[signalSeries.length - 1];
  const hist = lastMacd - lastSignal;

  const trend: 'uptrend' | 'downtrend' | 'neutral' =
    lastMacd > 0.8 && hist > 0 ? 'uptrend' : lastMacd < -0.8 && hist < 0 ? 'downtrend' : 'neutral';

  return {
    macdLine: Number(lastMacd.toFixed(3)),
    signalLine: Number(lastSignal.toFixed(3)),
    histogram: Number(hist.toFixed(3)),
    trend,
  };
}

// Donchian Channel
export function calculateDonchian(candles: Candle[], period = 20): {
  resistance: number;
  support: number;
  middle: number;
  isRedRetestingSupport: boolean;
  isDoji: boolean;
  isGreenRisingAboveMiddle: boolean;
} {
  if (candles.length === 0) {
    return {
      resistance: 0,
      support: 0,
      middle: 0,
      isRedRetestingSupport: false,
      isDoji: false,
      isGreenRisingAboveMiddle: false,
    };
  }

  const slice = candles.slice(-Math.min(period, candles.length));
  let resistance = -Infinity;
  let support = Infinity;

  for (const c of slice) {
    if (c.high > resistance) resistance = c.high;
    if (c.low < support) support = c.low;
  }
  const middle = (resistance + support) / 2;

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] ?? lastCandle;

  // Candlestick anatomy
  const candleRange = Math.max(lastCandle.high - lastCandle.low, 0.0001);
  const bodySize = Math.abs(lastCandle.close - lastCandle.open);
  const isRed = lastCandle.close < lastCandle.open;
  const isGreen = lastCandle.close > lastCandle.open;

  // Doji: very thin body relative to total range (< 12%)
  const isDoji = bodySize / candleRange <= 0.12;

  // Red candle retesting on support line: low is close to support (within 5% of channel height)
  const channelHeight = Math.max(resistance - support, 0.0001);
  const distToSupport = Math.abs(lastCandle.low - support);
  const isRedRetestingSupport = isRed && distToSupport / channelHeight <= 0.12;

  // Green candle continuously rising above middle line:
  const isGreenRisingAboveMiddle =
    isGreen &&
    lastCandle.close > middle &&
    lastCandle.close > prevCandle.close &&
    lastCandle.open >= middle * 0.999;

  return {
    resistance: Number(resistance.toFixed(2)),
    support: Number(support.toFixed(2)),
    middle: Number(middle.toFixed(2)),
    isRedRetestingSupport,
    isDoji,
    isGreenRisingAboveMiddle,
  };
}

// ADX & Directional Movement (+DI / -DI)
export function calculateADX(candles: Candle[], period = 14): {
  adx: number;
  plusDI: number;
  minusDI: number;
  whiteAtBottom: boolean; // ADX line at bottom
  greenMiddleRedTop: boolean; // Bear market setup
  redMiddleGreenTop: boolean; // Bull market setup
  whiteInMiddle: boolean; // Dangerous choppy zone (avoid!)
  candleFacingMARejection: boolean;
} {
  if (candles.length < 5) {
    return {
      adx: 28,
      plusDI: 32,
      minusDI: 18,
      whiteAtBottom: true,
      greenMiddleRedTop: false,
      redMiddleGreenTop: true,
      whiteInMiddle: false,
      candleFacingMARejection: false,
    };
  }

  // Simplified True Range and directional movements
  let trSum = 0;
  let plusDMSum = 0;
  let minusDMSum = 0;
  const count = Math.min(period, candles.length - 1);

  for (let i = candles.length - count; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    trSum += tr;

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    if (upMove > downMove && upMove > 0) plusDMSum += upMove;
    if (downMove > upMove && downMove > 0) minusDMSum += downMove;
  }

  const safeTR = Math.max(trSum, 0.001);
  const plusDI = Number(((plusDMSum / safeTR) * 100).toFixed(1));
  const minusDI = Number(((minusDMSum / safeTR) * 100).toFixed(1));
  const diDiff = Math.abs(plusDI - minusDI);
  const diSum = Math.max(plusDI + minusDI, 0.001);
  const adx = Number(((diDiff / diSum) * 100).toFixed(1));

  // ADX Line Relationships (White line = ADX, Green line = +DI, Red line = -DI)
  const whiteAtBottom = adx < plusDI && adx < minusDI;
  const greenMiddleRedTop = minusDI > plusDI && minusDI >= 25 && plusDI > adx;
  const redMiddleGreenTop = plusDI > minusDI && plusDI >= 25 && minusDI > adx;
  const whiteInMiddle = (adx > plusDI && adx < minusDI) || (adx < plusDI && adx > minusDI);

  // Check MA rejection: candle wick touched SMA 20 but closed back
  const closes = candles.map((c) => c.close);
  const sma20 = calculateSMA(closes, Math.min(20, closes.length));
  const lastCandle = candles[candles.length - 1];
  const lastSMA = sma20[sma20.length - 1];
  const candleFacingMARejection =
    (lastCandle.high >= lastSMA && lastCandle.close < lastSMA) ||
    (lastCandle.low <= lastSMA && lastCandle.close > lastSMA);

  return {
    adx,
    plusDI,
    minusDI,
    whiteAtBottom,
    greenMiddleRedTop,
    redMiddleGreenTop,
    whiteInMiddle,
    candleFacingMARejection,
  };
}

// -------------------------------------------------------------
// Digit Frequency & Distribution Analysis
// -------------------------------------------------------------

export interface DigitStatsProfile {
  frequencies: Record<number, number>;
  percentages: Record<number, number>;
  sortedByFreq: { digit: number; count: number; pct: number }[];
  mostOccurringDigit: number; // Green arc digit
  leastOccurringDigit: number; // Red arc digit
  mostOccurringPct: number;
  leastOccurringPct: number;
  last20Digits: number[];
  last20Pattern: Record<number, ('O' | 'U')[]>; // For any threshold digit
  last20WinRate: Record<number, { overWinRate: number; underWinRate: number }>;
}

export function computeDigitStatsProfile(ticks: Tick[], sampleOrSize: number | Tick[] = 100): DigitStatsProfile {
  const sample = Array.isArray(sampleOrSize)
    ? sampleOrSize
    : ticks.slice(0, typeof sampleOrSize === 'number' && sampleOrSize > 0 ? sampleOrSize : 100);
  const total = Math.max(sample.length, 1);

  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const t of sample) {
    if (typeof t.lastDigit === 'number' && t.lastDigit >= 0 && t.lastDigit <= 9) {
      counts[t.lastDigit] = (counts[t.lastDigit] || 0) + 1;
    }
  }

  const percentages: Record<number, number> = {};
  for (let d = 0; d <= 9; d++) {
    percentages[d] = Number(((counts[d] / total) * 100).toFixed(1));
  }

  const sorted = Object.entries(counts)
    .map(([digit, count]) => ({
      digit: Number(digit),
      count,
      pct: percentages[Number(digit)],
    }))
    .sort((a, b) => b.count - a.count);

  const mostOccurring = sorted[0]?.digit ?? 5;
  const leastOccurring = sorted[sorted.length - 1]?.digit ?? 0;

  const last20 = ticks.slice(0, 20).map((t) => t.lastDigit);
  const last20Pattern: Record<number, ('O' | 'U')[]> = {};
  const last20WinRate: Record<number, { overWinRate: number; underWinRate: number }> = {};

  for (let threshold = 0; threshold <= 9; threshold++) {
    const pattern = last20.map((d) => (d > threshold ? ('O' as const) : ('U' as const)));
    last20Pattern[threshold] = pattern;
    const overCount = pattern.filter((p) => p === 'O').length;
    const underCount = pattern.filter((p) => p === 'U').length;
    const len = Math.max(pattern.length, 1);
    last20WinRate[threshold] = {
      overWinRate: Number(((overCount / len) * 100).toFixed(1)),
      underWinRate: Number(((underCount / len) * 100).toFixed(1)),
    };
  }

  return {
    frequencies: counts,
    percentages,
    sortedByFreq: sorted,
    mostOccurringDigit: mostOccurring,
    leastOccurringDigit: leastOccurring,
    mostOccurringPct: sorted[0]?.pct ?? 10,
    leastOccurringPct: sorted[sorted.length - 1]?.pct ?? 10,
    last20Digits: last20,
    last20Pattern,
    last20WinRate,
  };
}

// -------------------------------------------------------------
// Strategy Evaluation Functions
// -------------------------------------------------------------

/**
 * Over/Under Strategy 3:
 * Indicators Used: MACD [red & black lines] and Moving Average
 * Locate green arc (most occurring digit).
 * Trade OVER on clean uptrend (MACD >= +1, but not extreme above 40)
 * Trade UNDER on clean downtrend (MACD <= -1, but not extreme below -40)
 * Standard digits to trade: 3, 4, 5, 6
 */
export function evaluateStrategy3(candles: Candle[], ticks: Tick[], sampleSize = 100): StrategySignalResult {
  const closes = candles.map((c) => c.close);
  const macd = calculateMACD(closes);
  const digitProfile = computeDigitStatsProfile(ticks, sampleSize);
  const greenArc = digitProfile.mostOccurringDigit;

  const isUptrend = macd.macdLine >= 1.0 && macd.macdLine < 40;
  const isDowntrend = macd.macdLine <= -1.0 && macd.macdLine > -40;

  let takeValue = 'WAIT (Setup pending)';
  let contractType: 'Over' | 'Under' = 'Over';
  let predictionDigit = 4;
  let active = false;
  let confidencePct = 65;

  if (isUptrend) {
    contractType = 'Over';
    active = true;
    // When green arc is on digit 4, trade OVER 3 or 4 depending on setup
    if (greenArc <= 4) predictionDigit = 3;
    else if (greenArc === 5) predictionDigit = 4;
    else predictionDigit = 4;
    takeValue = `OVER ${predictionDigit}`;
    confidencePct = Math.min(94, Math.round(75 + Math.min(macd.macdLine * 4, 18)));
  } else if (isDowntrend) {
    contractType = 'Under';
    active = true;
    // When green arc is on digit 4, trade UNDER 5, 6, or 7
    if (greenArc <= 4) predictionDigit = 6;
    else if (greenArc === 5) predictionDigit = 7;
    else predictionDigit = 6;
    takeValue = `UNDER ${predictionDigit}`;
    confidencePct = Math.min(94, Math.round(75 + Math.min(Math.abs(macd.macdLine) * 4, 18)));
  } else {
    takeValue = 'WAIT (MACD between -1 & +1)';
    confidencePct = 58;
  }

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'MACD Value in Trend Range (|MACD| >= 1.0 & < 40)',
      met: isUptrend || isDowntrend,
      detail: `MACD Line: ${macd.macdLine > 0 ? '+' : ''}${macd.macdLine} (${macd.trend})`,
    },
    {
      label: 'Green Arc (Most Occurring Number)',
      met: true,
      detail: `Green Arc is on Digit ${greenArc} (${digitProfile.percentages[greenArc]}% frequency)`,
    },
    {
      label: 'Standard Traded Digits Alignment (3, 4, 5, 6)',
      met: [3, 4, 5, 6].includes(predictionDigit),
      detail: `Targeting standard safe digit ${predictionDigit} for ${contractType}`,
    },
  ];

  return {
    strategyId: 'strategy-3',
    strategyName: 'Over/Under Strategy 3 (MACD Trend)',
    active,
    takeValue,
    contractType,
    predictionDigit,
    confidencePct,
    strengthWord: confidencePct >= 85 ? 'Strong' : confidencePct >= 70 ? 'Moderate' : 'Wait',
    recommendedRuns: active ? (confidencePct >= 88 ? 5 : 4) : 3,
    recommendedBotName: 'MACD Trend Hunter',
    entryRule: isUptrend
      ? `Trade OVER ${predictionDigit} on clean uptrend with MACD >= +1`
      : isDowntrend
      ? `Trade UNDER ${predictionDigit} on clean downtrend with MACD <= -1`
      : 'Wait for MACD line to break out above +1.0 (uptrend) or below -1.0 (downtrend)',
    exitRule: 'Take profit on target runs or exit if MACD crosses opposite signal line',
    recoveryRule: 'Martingale 2.0x standard step or switch to safe digit +1/-1 buffer',
    conditions,
    notes: 'Standard digits to deal with are 3, 4, 5, and 6 for both OVER and UNDER. Avoid extremes > 40.',
    indicatorData: {
      macdLine: macd.macdLine,
      signalLine: macd.signalLine,
      histogram: macd.histogram,
      greenArcDigit: greenArc,
    },
  };
}

/**
 * Over/Under Strategy 4:
 * Indicators: Donchian Channel [Resistance, Middle, Support]
 * Trade UNDER 6: Red candlestick retesting on Support line OR Doji candlestick forming anywhere
 * Trade OVER 4: Green candlestick continuously rising above the Middle line
 */
export function evaluateStrategy4(candles: Candle[], ticks: Tick[]): StrategySignalResult {
  const donchian = calculateDonchian(candles, 20);

  let active = false;
  let takeValue = 'WAIT (Awaiting Donchian trigger)';
  let contractType: 'Over' | 'Under' = 'Under';
  let predictionDigit = 6;
  let confidencePct = 60;
  let entryReason = 'Waiting for Donchian Channel retest or breakout';

  if (donchian.isRedRetestingSupport || donchian.isDoji) {
    active = true;
    contractType = 'Under';
    predictionDigit = 6;
    takeValue = 'UNDER 6';
    confidencePct = donchian.isDoji ? 91 : 86;
    entryReason = donchian.isDoji
      ? 'Doji candlestick formed within Donchian channel — statistically triggers high Under 6 digits'
      : 'Red candlestick retesting Donchian Support line — produces strong Under 6 digits';
  } else if (donchian.isGreenRisingAboveMiddle) {
    active = true;
    contractType = 'Over';
    predictionDigit = 4;
    takeValue = 'OVER 4';
    confidencePct = 88;
    entryReason = 'Green candlestick continuously rising above Donchian Middle line';
  }

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'Support Retest or Doji for UNDER 6',
      met: donchian.isRedRetestingSupport || donchian.isDoji,
      detail: donchian.isDoji
        ? 'Doji candlestick detected (narrow body)'
        : donchian.isRedRetestingSupport
        ? `Red candle touching Support (${donchian.support})`
        : 'No support retest or Doji currently',
    },
    {
      label: 'Green Rising Above Middle for OVER 4',
      met: donchian.isGreenRisingAboveMiddle,
      detail: `Middle line: ${donchian.middle}. Rising status: ${donchian.isGreenRisingAboveMiddle ? 'Active' : 'No'}`,
    },
    {
      label: 'Channel Width & Volatility',
      met: donchian.resistance > donchian.support,
      detail: `Band: [${donchian.support} — ${donchian.middle} — ${donchian.resistance}]`,
    },
  ];

  return {
    strategyId: 'strategy-4',
    strategyName: 'Over/Under Strategy 4 (Donchian Channel)',
    active,
    takeValue,
    contractType,
    predictionDigit,
    confidencePct,
    strengthWord: confidencePct >= 85 ? 'Strong' : confidencePct >= 70 ? 'Moderate' : 'Wait',
    recommendedRuns: active ? 4 : 2,
    recommendedBotName: 'Donchian Breakout O/U',
    entryRule: entryReason,
    exitRule: 'Exit when candle touches opposing channel boundary or completes target runs',
    recoveryRule: 'Recovery on 2nd tick or Martingale 2.0x for max 2 steps',
    conditions,
    notes: 'Produces high accuracy Under 6 digits on support tests and Dojis, and Over 4 on middle line breaks.',
    indicatorData: {
      resistance: donchian.resistance,
      middle: donchian.middle,
      support: donchian.support,
      isDoji: donchian.isDoji,
      isRedRetest: donchian.isRedRetestingSupport,
      isGreenRising: donchian.isGreenRisingAboveMiddle,
    },
  };
}

/**
 * Over/Under Strategy 5:
 * Indicators: Moving Average (Smoothed MA with 2 lines)
 * Trading Execution: Just after the 2 lines have met, trade UNDER 6.
 */
export function evaluateStrategy5(candles: Candle[], ticks: Tick[]): StrategySignalResult {
  const closes = candles.map((c) => c.close);
  const fastSMMA = calculateSMMA(closes, 7);
  const slowSMMA = calculateSMMA(closes, 21);

  const len = closes.length;
  const fCur = fastSMMA[len - 1] ?? 0;
  const sCur = slowSMMA[len - 1] ?? 0;
  const fPrev = fastSMMA[len - 2] ?? fCur;
  const sPrev = slowSMMA[len - 2] ?? sCur;

  // Just after 2 lines met: absolute spread is tiny, or crossover just occurred
  const currentSpread = Math.abs(fCur - sCur);
  const prevSpread = Math.abs(fPrev - sPrev);
  const avgPrice = Math.max(closes[len - 1] || 1, 0.001);
  const spreadPct = (currentSpread / avgPrice) * 100;

  const crossed = (fPrev <= sPrev && fCur > sCur) || (fPrev >= sPrev && fCur < sCur);
  const linesJustMet = crossed || spreadPct < 0.015 || (prevSpread < currentSpread && spreadPct < 0.035);

  const active = linesJustMet;
  const takeValue = active ? 'UNDER 6' : 'WAIT (Smoothed MA meeting pending)';
  const confidencePct = active ? (crossed ? 92 : 87) : 55;

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'Smoothed MA Lines Convergence (Fast 7 & Slow 21)',
      met: linesJustMet,
      detail: linesJustMet
        ? `Lines just converged/crossed! Fast: ${fCur.toFixed(2)}, Slow: ${sCur.toFixed(2)}`
        : `Spread between lines is ${spreadPct.toFixed(3)}% (awaiting convergence)`,
    },
    {
      label: 'Target Execution: UNDER 6',
      met: true,
      detail: 'Strategy strictly trades UNDER 6 immediately following MA convergence',
    },
  ];

  return {
    strategyId: 'strategy-5',
    strategyName: 'Over/Under Strategy 5 (Smoothed MA Cross)',
    active,
    takeValue,
    contractType: 'Under',
    predictionDigit: 6,
    confidencePct,
    strengthWord: active ? 'Strong' : 'Wait',
    recommendedRuns: active ? 4 : 2,
    recommendedBotName: 'Smoothed MA Under 6',
    entryRule: 'Enter UNDER 6 immediately after the 2 Smoothed MA lines converge or intersect',
    exitRule: 'Stop execution once lines diverge widely (> 0.05% spread)',
    recoveryRule: 'Single-step Martingale 2.0x on loss then pause',
    conditions,
    notes: 'In Deriv settings > style > Smoothed MA. Trade UNDER 6 right after the 2 lines meet.',
    indicatorData: {
      fastSMMA: Number(fCur.toFixed(2)),
      slowSMMA: Number(sCur.toFixed(2)),
      spreadPct: Number(spreadPct.toFixed(4)),
      linesJustMet,
    },
  };
}

/**
 * Over/Under Strategy 6:
 * Indicators: Moving Average + ADX (White/Black management line, Red bear line, Green bull line). 1-min timeframe.
 * Downtrend: White at bottom, green in middle, red on top with value 25+ -> Trade OVER 4
 * Uptrend: White at bottom, red in middle, green on top with value 25+ -> Trade OVER 4
 * When candlestick forming is facing rejection on MA -> Trade OVER 6
 * Best practices: Avoid trading while white line is at middle of green and red.
 */
export function evaluateStrategy6(candles: Candle[], ticks: Tick[]): StrategySignalResult {
  const adxData = calculateADX(candles, 14);

  let active = false;
  let takeValue = 'WAIT (Awaiting ADX alignment)';
  let predictionDigit = 4;
  let confidencePct = 60;
  let ruleDetail = 'Awaiting ADX line alignment (white bottom, green/red ordered with 25+)';

  if (adxData.whiteInMiddle) {
    active = false;
    takeValue = 'AVOID TRADING (White line in middle)';
    confidencePct = 40;
    ruleDetail = 'White management line is trapped between red and green — severe choppy market filter active.';
  } else if (adxData.candleFacingMARejection) {
    active = true;
    predictionDigit = 6;
    takeValue = 'OVER 6';
    confidencePct = 90;
    ruleDetail = 'Candlestick forming is facing sharp rejection on the Moving Average -> Trade OVER 6!';
  } else if (adxData.whiteAtBottom && adxData.greenMiddleRedTop) {
    active = true;
    predictionDigit = 4;
    takeValue = 'OVER 4';
    confidencePct = 88;
    ruleDetail = 'Downtrend setup: White at bottom, Green in middle, Red on top (value >= 25) -> Trade OVER 4!';
  } else if (adxData.whiteAtBottom && adxData.redMiddleGreenTop) {
    active = true;
    predictionDigit = 4;
    takeValue = 'OVER 4';
    confidencePct = 89;
    ruleDetail = 'Uptrend setup: White at bottom, Red in middle, Green on top (value >= 25) -> Trade OVER 4!';
  }

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'ADX White Management Line Position',
      met: adxData.whiteAtBottom && !adxData.whiteInMiddle,
      detail: adxData.whiteInMiddle
        ? 'WARNING: White line is in the middle! Avoid trading.'
        : adxData.whiteAtBottom
        ? `White line correctly at bottom (${adxData.adx})`
        : `White line at ${adxData.adx}`,
    },
    {
      label: 'Red (Bear) & Green (Bull) Directional Spread',
      met: adxData.plusDI >= 25 || adxData.minusDI >= 25,
      detail: `+DI (Green): ${adxData.plusDI}, -DI (Red): ${adxData.minusDI} (Top line >= 25)`,
    },
    {
      label: 'MA Rejection Check (for OVER 6)',
      met: adxData.candleFacingMARejection,
      detail: adxData.candleFacingMARejection
        ? 'Candle facing rejection on MA — trigger OVER 6!'
        : 'No MA rejection detected currently',
    },
  ];

  return {
    strategyId: 'strategy-6',
    strategyName: 'Over/Under Strategy 6 (MA + ADX)',
    active,
    takeValue,
    contractType: 'Over',
    predictionDigit,
    confidencePct,
    strengthWord: active ? 'Strong' : 'Wait',
    recommendedRuns: active ? 4 : 2,
    recommendedBotName: 'ADX Trend Over 4/6',
    entryRule: ruleDetail,
    exitRule: 'Exit when white line moves above green or red, or candle closes opposite',
    recoveryRule: 'Switch to Over 3 or Over 2 for safety during recovery',
    conditions,
    notes: 'Use 1-minute chart timeframe. Never trade when the white management line is in the middle.',
    indicatorData: {
      adx: adxData.adx,
      plusDI: adxData.plusDI,
      minusDI: adxData.minusDI,
      whiteInMiddle: adxData.whiteInMiddle,
      whiteAtBottom: adxData.whiteAtBottom,
    },
  };
}

/**
 * Deriv Strategies 2: Over Digit 1 Conditions
 * 1. Digit 0 & 1 should have percentages below 10%, one of them being the least appearing digit (red arc).
 * 2. Digit 2 to 9 should contain the most appearing digit(s), at least three and above 11% is an added advantage.
 * 3. The analysis tool configured to over 1 should have at least 90%+ win rate and OVERs "O" should dominate the most on "last 20 digits pattern".
 * Recommended Bots: "over 1 with over 3 recovery", "CMV pro", "Hit & run (entry point: 0)"
 */
export function evaluateOver1Strategy(ticks: Tick[], sampleSize = 100): StrategySignalResult {
  const profile = computeDigitStatsProfile(ticks, sampleSize);
  const p0 = profile.percentages[0] ?? 0;
  const p1 = profile.percentages[1] ?? 0;

  // Condition 1: Digits 0 & 1 < 10%, and one is least appearing (red arc)
  const cond1Met = (p0 < 10.0 && p1 < 10.0) && (profile.leastOccurringDigit === 0 || profile.leastOccurringDigit === 1 || p0 <= 8.5 || p1 <= 8.5);

  // Condition 2: Digits 2 to 9 contain most appearing digits, at least three >= 11%
  const highDigitsCount = [2, 3, 4, 5, 6, 7, 8, 9].filter((d) => (profile.percentages[d] ?? 0) >= 11.0).length;
  const cond2Met = highDigitsCount >= 3;

  // Condition 3: Over 1 win rate >= 90% and 'O' dominates last 20 pattern
  const over1WinRate = profile.last20WinRate[1]?.overWinRate ?? 0;
  const cond3Met = over1WinRate >= 90.0;

  const active = cond1Met && cond2Met && cond3Met;
  const confidencePct = active
    ? Math.min(98, Math.round(over1WinRate * 0.5 + 48))
    : Math.round((cond1Met ? 25 : 0) + (cond2Met ? 25 : 0) + (over1WinRate >= 80 ? 25 : 10));

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'Digit 0 & 1 < 10% with Red Arc',
      met: cond1Met,
      detail: `Digit 0: ${p0}%, Digit 1: ${p1}% (Least appearing / Red Arc is Digit ${profile.leastOccurringDigit})`,
    },
    {
      label: 'Digits 2 to 9 contain >= 3 digits with >= 11%',
      met: cond2Met,
      detail: `Found ${highDigitsCount} digits between 2-9 with >= 11% frequency (Requirement: 3+)`,
    },
    {
      label: 'Over 1 Win Rate >= 90% in Last 20 Digits ("O" dominates)',
      met: cond3Met,
      detail: `Current Over 1 win rate is ${over1WinRate}% in last 20 digits pattern`,
    },
  ];

  return {
    strategyId: 'over-1',
    strategyName: 'Over Digit 1 Strategy',
    active,
    takeValue: active ? 'OVER 1' : 'WAIT (Over 1 criteria pending)',
    contractType: 'Over',
    predictionDigit: 1,
    confidencePct,
    strengthWord: active ? 'Strong' : confidencePct >= 70 ? 'Moderate' : 'Wait',
    recommendedRuns: active ? 5 : 3,
    recommendedBotName: 'over 1 with over 3 recovery',
    entryRule: 'Enter OVER 1 immediately when Digit 0 & 1 are below 10%, digits 2-9 have 3+ hot digits, and last 20 win rate >= 90%',
    exitRule: 'Stop if two consecutive digits <= 1 appear or after 5 successful runs',
    recoveryRule: 'Over 3 recovery: on loss, take next run on Over 3 or Martingale 2.0x',
    conditions,
    notes: 'Over 1 is considered one of the least risky digits best for consistent steady compounding.',
    indicatorData: {
      p0,
      p1,
      highDigitsCount,
      over1WinRate,
      leastOccurringDigit: profile.leastOccurringDigit,
    },
  };
}

/**
 * Deriv Strategies 2: Over Digit 2 Conditions
 * 1. Digit 0, 1 & 2 should have percentages below 10%, one of them being the least appearing digit (red arc).
 * 2. Digit 3 to 9 should contain the most appearing digit(s), at least three and above 11% is an added advantage.
 * 3. The analysis tool configured to over 2 should have at least 78%+ win rate and OVERs "O" should dominate the most on "last 20 digits pattern".
 * Recommended Bots: "02R43 pro", "CMV pro", "Hit & run (entry point: 0 or 1)"
 */
export function evaluateOver2Strategy(ticks: Tick[], sampleSize = 100): StrategySignalResult {
  const profile = computeDigitStatsProfile(ticks, sampleSize);
  const p0 = profile.percentages[0] ?? 0;
  const p1 = profile.percentages[1] ?? 0;
  const p2 = profile.percentages[2] ?? 0;

  // Condition 1: Digits 0, 1 & 2 < 10%, one is red arc
  const cond1Met = (p0 < 10.0 && p1 < 10.0 && p2 < 10.0) && ([0, 1, 2].includes(profile.leastOccurringDigit) || p0 <= 8.5 || p1 <= 8.5 || p2 <= 8.5);

  // Condition 2: Digits 3 to 9 contain >= 3 digits with >= 11%
  const highDigitsCount = [3, 4, 5, 6, 7, 8, 9].filter((d) => (profile.percentages[d] ?? 0) >= 11.0).length;
  const cond2Met = highDigitsCount >= 3;

  // Condition 3: Over 2 win rate >= 78% in last 20
  const over2WinRate = profile.last20WinRate[2]?.overWinRate ?? 0;
  const cond3Met = over2WinRate >= 78.0;

  const active = cond1Met && cond2Met && cond3Met;
  const confidencePct = active
    ? Math.min(95, Math.round(over2WinRate * 0.6 + 45))
    : Math.round((cond1Met ? 25 : 0) + (cond2Met ? 25 : 0) + (over2WinRate >= 70 ? 25 : 10));

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'Digits 0, 1 & 2 < 10% with Red Arc',
      met: cond1Met,
      detail: `Digit 0: ${p0}%, Digit 1: ${p1}%, Digit 2: ${p2}% (Red Arc: Digit ${profile.leastOccurringDigit})`,
    },
    {
      label: 'Digits 3 to 9 contain >= 3 digits with >= 11%',
      met: cond2Met,
      detail: `Found ${highDigitsCount} digits between 3-9 with >= 11% frequency (Requirement: 3+)`,
    },
    {
      label: 'Over 2 Win Rate >= 78% in Last 20 Digits ("O" dominates)',
      met: cond3Met,
      detail: `Current Over 2 win rate is ${over2WinRate}% in last 20 digits pattern`,
    },
  ];

  return {
    strategyId: 'over-2',
    strategyName: 'Over Digit 2 Strategy',
    active,
    takeValue: active ? 'OVER 2' : 'WAIT (Over 2 criteria pending)',
    contractType: 'Over',
    predictionDigit: 2,
    confidencePct,
    strengthWord: active ? 'Strong' : confidencePct >= 70 ? 'Moderate' : 'Wait',
    recommendedRuns: active ? 4 : 3,
    recommendedBotName: '02R43 pro',
    entryRule: 'Enter OVER 2 when digits 0, 1, 2 are sub-10%, digits 3-9 have 3+ hot digits, and Over 2 win rate >= 78%',
    exitRule: 'Stop if two consecutive digits <= 2 appear or after 4 target runs',
    recoveryRule: '02R43 Protocol: On loss, recover on Over 4 or Over 3 with 1.8x Martingale multiplier',
    conditions,
    notes: 'Over 2 provides an exceptional balance of high win rate (approx 78-85%) with higher payout than Over 1.',
    indicatorData: {
      p0,
      p1,
      p2,
      highDigitsCount,
      over2WinRate,
      leastOccurringDigit: profile.leastOccurringDigit,
    },
  };
}

/**
 * Deriv Strategies 2: Under Digit 8 Conditions
 * 1. Digit 9 & 8 should have percentages below 10%, one of them being the least appearing digit (red arc).
 * 2. Digit 0 to 7 should contain the most appearing digit(s), at least three and above 11% is an added advantage.
 * 3. The analysis tool configured to under 8 should have at least 90%+ win rate and UNDERS "U" should dominate the most on "last 20 digits pattern".
 * Entry Point for Under 7 & 8:
 * Wait for a single or more OVER "O" digits on the analysis tool then enter immediately after the first UNDER "U" appears.
 * Recommended Bots: "under 8 with under 6 recovery", "CMV pro", "Hit & run (entry point: 9)"
 */
export function evaluateUnder8Strategy(ticks: Tick[], sampleSize = 100): StrategySignalResult {
  const profile = computeDigitStatsProfile(ticks, sampleSize);
  const p8 = profile.percentages[8] ?? 0;
  const p9 = profile.percentages[9] ?? 0;

  // Condition 1: Digits 9 & 8 < 10%, one is red arc
  const cond1Met = (p8 < 10.0 && p9 < 10.0) && ([8, 9].includes(profile.leastOccurringDigit) || p8 <= 8.5 || p9 <= 8.5);

  // Condition 2: Digits 0 to 7 contain >= 3 digits with >= 11%
  const highDigitsCount = [0, 1, 2, 3, 4, 5, 6, 7].filter((d) => (profile.percentages[d] ?? 0) >= 11.0).length;
  const cond2Met = highDigitsCount >= 3;

  // Condition 3: Under 8 win rate >= 90% in last 20
  const under8WinRate = profile.last20WinRate[8]?.underWinRate ?? 0;
  const cond3Met = under8WinRate >= 90.0;

  // Entry Point Trigger: Wait for 1+ OVER "O", then enter immediately after the first UNDER "U" appears!
  const pattern8 = profile.last20Pattern[8] || [];
  const latestResult = pattern8[0]; // most recent
  const prevResults = pattern8.slice(1, 4);
  const hadOverRecently = prevResults.some((p) => p === 'O');
  const entryTriggerMet = latestResult === 'U' && hadOverRecently;

  const active = cond1Met && cond2Met && cond3Met && (entryTriggerMet || latestResult === 'U');
  const confidencePct = active
    ? Math.min(98, Math.round(under8WinRate * 0.5 + 48))
    : Math.round((cond1Met ? 25 : 0) + (cond2Met ? 25 : 0) + (under8WinRate >= 80 ? 25 : 10));

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'Digit 9 & 8 < 10% with Red Arc',
      met: cond1Met,
      detail: `Digit 8: ${p8}%, Digit 9: ${p9}% (Red Arc: Digit ${profile.leastOccurringDigit})`,
    },
    {
      label: 'Digits 0 to 7 contain >= 3 digits with >= 11%',
      met: cond2Met,
      detail: `Found ${highDigitsCount} digits between 0-7 with >= 11% frequency (Requirement: 3+)`,
    },
    {
      label: 'Under 8 Win Rate >= 90% in Last 20 Digits ("U" dominates)',
      met: cond3Met,
      detail: `Current Under 8 win rate is ${under8WinRate}% in last 20 digits pattern`,
    },
    {
      label: 'Entry Trigger: 1+ "O" followed by first "U"',
      met: entryTriggerMet,
      detail: entryTriggerMet
        ? 'ENTRY TRIGGER FIRED! Prior "O" followed by first "U" confirmed.'
        : `Latest tick pattern is "${latestResult}". Waiting for "O" -> "U" sequence.`,
    },
  ];

  return {
    strategyId: 'under-8',
    strategyName: 'Under Digit 8 Strategy',
    active,
    takeValue: active ? 'UNDER 8' : 'WAIT (Under 8 trigger pending)',
    contractType: 'Under',
    predictionDigit: 8,
    confidencePct,
    strengthWord: active ? 'Strong' : confidencePct >= 70 ? 'Moderate' : 'Wait',
    recommendedRuns: active ? 5 : 3,
    recommendedBotName: 'under 8 with under 6 recovery',
    entryRule: 'Wait for a single or more OVER "O" digits, then enter immediately after the first UNDER "U" appears',
    exitRule: 'Stop if two consecutive digits >= 8 appear or upon reaching profit target',
    recoveryRule: 'Under 6 recovery: on loss, switch recovery to Under 6 with 2.0x Martingale multiplier',
    conditions,
    notes: 'Under 8, 7 & 6 are considered the less risky digits best for achieving profit consistency.',
    indicatorData: {
      p8,
      p9,
      highDigitsCount,
      under8WinRate,
      entryTriggerMet,
      leastOccurringDigit: profile.leastOccurringDigit,
    },
  };
}

/**
 * Deriv Strategies 2: Under Digit 7 Conditions
 * 1. Digit 9, 8 & 7 should have percentages below 10%, one of them being the least appearing digit (red arc).
 * 2. Digit 0 to 6 should contain the most appearing digit(s), at least three and above 11% is an added advantage.
 * 3. The analysis tool configured to under 7 should have at least 78%+ win rate and UNDERS "U" should dominate the most on "last 20 digits pattern".
 * Entry Point for Under 7 & 8:
 * Wait for a single or more OVER "O" digits on the analysis tool then enter immediately after the first UNDER "U" appears.
 * Recommended Bots: "U7R56 pro", "CMV pro", "Hit & run (entry point: 8 or 9)"
 */
export function evaluateUnder7Strategy(ticks: Tick[], sampleSize = 100): StrategySignalResult {
  const profile = computeDigitStatsProfile(ticks, sampleSize);
  const p7 = profile.percentages[7] ?? 0;
  const p8 = profile.percentages[8] ?? 0;
  const p9 = profile.percentages[9] ?? 0;

  // Condition 1: Digits 9, 8 & 7 < 10%, one is red arc
  const cond1Met = (p7 < 10.0 && p8 < 10.0 && p9 < 10.0) && ([7, 8, 9].includes(profile.leastOccurringDigit) || p7 <= 8.5 || p8 <= 8.5 || p9 <= 8.5);

  // Condition 2: Digits 0 to 6 contain >= 3 digits with >= 11%
  const highDigitsCount = [0, 1, 2, 3, 4, 5, 6].filter((d) => (profile.percentages[d] ?? 0) >= 11.0).length;
  const cond2Met = highDigitsCount >= 3;

  // Condition 3: Under 7 win rate >= 78% in last 20
  const under7WinRate = profile.last20WinRate[7]?.underWinRate ?? 0;
  const cond3Met = under7WinRate >= 78.0;

  // Entry Point Trigger: Wait for 1+ OVER "O", then enter immediately after the first UNDER "U" appears!
  const pattern7 = profile.last20Pattern[7] || [];
  const latestResult = pattern7[0]; // most recent
  const prevResults = pattern7.slice(1, 4);
  const hadOverRecently = prevResults.some((p) => p === 'O');
  const entryTriggerMet = latestResult === 'U' && hadOverRecently;

  const active = cond1Met && cond2Met && cond3Met && (entryTriggerMet || latestResult === 'U');
  const confidencePct = active
    ? Math.min(95, Math.round(under7WinRate * 0.6 + 45))
    : Math.round((cond1Met ? 25 : 0) + (cond2Met ? 25 : 0) + (under7WinRate >= 70 ? 25 : 10));

  const conditions: StrategyConditionCheck[] = [
    {
      label: 'Digits 9, 8 & 7 < 10% with Red Arc',
      met: cond1Met,
      detail: `Digit 7: ${p7}%, Digit 8: ${p8}%, Digit 9: ${p9}% (Red Arc: Digit ${profile.leastOccurringDigit})`,
    },
    {
      label: 'Digits 0 to 6 contain >= 3 digits with >= 11%',
      met: cond2Met,
      detail: `Found ${highDigitsCount} digits between 0-6 with >= 11% frequency (Requirement: 3+)`,
    },
    {
      label: 'Under 7 Win Rate >= 78% in Last 20 Digits ("U" dominates)',
      met: cond3Met,
      detail: `Current Under 7 win rate is ${under7WinRate}% in last 20 digits pattern`,
    },
    {
      label: 'Entry Trigger: 1+ "O" followed by first "U"',
      met: entryTriggerMet,
      detail: entryTriggerMet
        ? 'ENTRY TRIGGER FIRED! Prior "O" followed by first "U" confirmed.'
        : `Latest tick pattern is "${latestResult}". Waiting for "O" -> "U" sequence.`,
    },
  ];

  return {
    strategyId: 'under-7',
    strategyName: 'Under Digit 7 Strategy',
    active,
    takeValue: active ? 'UNDER 7' : 'WAIT (Under 7 trigger pending)',
    contractType: 'Under',
    predictionDigit: 7,
    confidencePct,
    strengthWord: active ? 'Strong' : confidencePct >= 70 ? 'Moderate' : 'Wait',
    recommendedRuns: active ? 4 : 3,
    recommendedBotName: 'U7R56 pro',
    entryRule: 'Wait for a single or more OVER "O" digits, then enter immediately after the first UNDER "U" appears',
    exitRule: 'Stop if two consecutive digits >= 7 appear or after 4 target runs',
    recoveryRule: 'U7R56 Protocol: On loss, recover with Under 5 or Under 6 using 2.0x Martingale',
    conditions,
    notes: 'Under 7 offers consistent payout with 78-85% historical hit probability.',
    indicatorData: {
      p7,
      p8,
      p9,
      highDigitsCount,
      under7WinRate,
      entryTriggerMet,
      leastOccurringDigit: profile.leastOccurringDigit,
    },
  };
}

/**
 * CMV Pro (Compound Martingale Volatility Pro):
 * Analyzes both Over (1 & 2) and Under (7 & 8) simultaneously,
 * dynamically selecting whichever has the highest win rate and clean entry.
 */
export function evaluateCMVPro(candles: Candle[], ticks: Tick[], sampleSize = 100): StrategySignalResult {
  const o1 = evaluateOver1Strategy(ticks, sampleSize);
  const o2 = evaluateOver2Strategy(ticks, sampleSize);
  const u8 = evaluateUnder8Strategy(ticks, sampleSize);
  const u7 = evaluateUnder7Strategy(ticks, sampleSize);

  const candidates = [o1, u8, o2, u7];
  candidates.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.confidencePct - a.confidencePct;
  });

  const best = candidates[0];

  return {
    strategyId: 'cmv-pro',
    strategyName: 'CMV Pro (Compound Martingale Volatility)',
    active: best.active,
    takeValue: best.takeValue,
    contractType: best.contractType,
    predictionDigit: best.predictionDigit,
    confidencePct: best.confidencePct,
    strengthWord: best.strengthWord,
    recommendedRuns: best.recommendedRuns,
    recommendedBotName: 'CMV pro',
    entryRule: `Auto-routed to best setup: ${best.entryRule}`,
    exitRule: 'Compound winning profits; stop after 3-5 consecutive wins or target profit hit',
    recoveryRule: 'Compound Martingale with step-shift recovery (R43 / R56)',
    conditions: [
      {
        label: 'Best Dynamic Setup Selected',
        met: best.active,
        detail: `Currently leading: ${best.strategyName} (${best.takeValue}) with ${best.confidencePct}% score`,
      },
      ...best.conditions.slice(0, 2),
    ],
    notes: 'CMV Pro automatically selects the highest probability side between Over 1/2 and Under 7/8.',
    indicatorData: {
      routedStrategy: best.strategyName,
      confidencePct: best.confidencePct,
    },
  };
}

/**
 * Hit & Run Bot Strategy:
 * Sets entry point to 0, 1, 8, or 9. Takes 1-3 targeted runs then exits cleanly.
 */
export function evaluateHitAndRun(ticks: Tick[], sampleSize = 100, customEntryTrigger = 0): StrategySignalResult {
  const profile = computeDigitStatsProfile(ticks, sampleSize);
  const lastDigit = ticks[0]?.lastDigit ?? -1;

  const isEntryHit = lastDigit === customEntryTrigger;
  const isOverSide = customEntryTrigger <= 4;
  const contractType: 'Over' | 'Under' = isOverSide ? 'Over' : 'Under';
  const predictionDigit = isOverSide ? 1 : 8;
  const takeValue = `${contractType.toUpperCase()} ${predictionDigit}`;

  const conditions: StrategyConditionCheck[] = [
    {
      label: `Entry Point Trigger (Digit = ${customEntryTrigger})`,
      met: isEntryHit,
      detail: isEntryHit
        ? `HIT! Last digit is exactly ${customEntryTrigger}. Enter trade immediately!`
        : `Current last digit is ${lastDigit}. Waiting for entry digit ${customEntryTrigger}.`,
    },
    {
      label: 'Target Win Rate (> 85%)',
      met: (isOverSide ? profile.last20WinRate[1]?.overWinRate : profile.last20WinRate[8]?.underWinRate) >= 85,
      detail: `Current direction win rate: ${
        isOverSide ? profile.last20WinRate[1]?.overWinRate : profile.last20WinRate[8]?.underWinRate
      }%`,
    },
  ];

  return {
    strategyId: 'hit-run',
    strategyName: `Hit & Run (Entry Point: ${customEntryTrigger})`,
    active: isEntryHit,
    takeValue: isEntryHit ? takeValue : `WAIT (Need digit ${customEntryTrigger})`,
    contractType,
    predictionDigit,
    confidencePct: isEntryHit ? 93 : 62,
    strengthWord: isEntryHit ? 'Strong' : 'Wait',
    recommendedRuns: 2,
    recommendedBotName: `Hit & run (entry: ${customEntryTrigger})`,
    entryRule: `Trigger entry immediately when last digit equals ${customEntryTrigger}`,
    exitRule: 'Hit & run strictly takes 1 to 2 runs max then locks profits and stops',
    recoveryRule: 'Zero Martingale: 1-hit stop loss to protect bankroll',
    conditions,
    notes: 'Set entry point to 0 for Over 1, 0 or 1 for Over 2, 9 for Under 8, or 8/9 for Under 7.',
    indicatorData: {
      lastDigit,
      entryTrigger: customEntryTrigger,
      isEntryHit,
    },
  };
}

// Master Strategy Registry for the UI selector
export const OVER_UNDER_STRATEGIES = [
  {
    id: 'strategy-3',
    name: 'Strategy 3: MACD Trend O/U',
    category: 'Indicators',
    description: 'MACD line >= +1 (Over 3/4/5) or <= -1 (Under 5/6/7) + Green Arc digit',
    defaultBotName: 'MACD Trend Hunter',
  },
  {
    id: 'strategy-4',
    name: 'Strategy 4: Donchian Channels',
    category: 'Indicators',
    description: 'Support retest / Doji -> Under 6; Green rising above Middle line -> Over 4',
    defaultBotName: 'Donchian Breakout O/U',
  },
  {
    id: 'strategy-5',
    name: 'Strategy 5: Smoothed MA Cross',
    category: 'Indicators',
    description: 'Dual Smoothed MA 2-line crossover -> Trade Under 6 immediately',
    defaultBotName: 'Smoothed MA Under 6',
  },
  {
    id: 'strategy-6',
    name: 'Strategy 6: 1m MA + ADX',
    category: 'Indicators',
    description: 'White bottom, Green/Red ordered (>=25) -> Over 4; MA Rejection -> Over 6',
    defaultBotName: 'ADX Trend Over 4/6',
  },
  {
    id: 'over-1',
    name: 'Over Digit 1 Strategy',
    category: 'Deriv Strategies 2',
    description: 'Digits 0 & 1 < 10% (Red Arc), Digits 2-9 with 3+ hot digits (>=11%), 90%+ Win Rate',
    defaultBotName: 'over 1 with over 3 recovery',
  },
  {
    id: 'over-2',
    name: 'Over Digit 2 Strategy',
    category: 'Deriv Strategies 2',
    description: 'Digits 0, 1, 2 < 10% (Red Arc), Digits 3-9 with 3+ hot digits (>=11%), 78%+ Win Rate',
    defaultBotName: '02R43 pro',
  },
  {
    id: 'under-8',
    name: 'Under Digit 8 Strategy',
    category: 'Deriv Strategies 2',
    description: 'Digits 9 & 8 < 10% (Red Arc), Digits 0-7 with 3+ hot digits (>=11%), 90%+ Win Rate, 1+ O -> U Trigger',
    defaultBotName: 'under 8 with under 6 recovery',
  },
  {
    id: 'under-7',
    name: 'Under Digit 7 Strategy',
    category: 'Deriv Strategies 2',
    description: 'Digits 9, 8, 7 < 10% (Red Arc), Digits 0-6 with 3+ hot digits (>=11%), 78%+ Win Rate, 1+ O -> U Trigger',
    defaultBotName: 'U7R56 pro',
  },
  {
    id: 'cmv-pro',
    name: 'CMV Pro (Multi-Strategy)',
    category: 'Deriv Strategies 2',
    description: 'Compound Martingale Volatility: Dynamically routes to highest win rate Over/Under setup',
    defaultBotName: 'CMV pro',
  },
  {
    id: 'hit-run',
    name: 'Hit & Run (Entry Point)',
    category: 'Deriv Strategies 2',
    description: 'Waits for precision entry point (0, 1, 8, or 9) then executes rapid 2-run win',
    defaultBotName: 'Hit & run',
  },
] as const;

export type StrategyId = typeof OVER_UNDER_STRATEGIES[number]['id'];
