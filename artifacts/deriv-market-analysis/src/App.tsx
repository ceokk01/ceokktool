import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGetDerivConfig } from '@workspace/api-client-react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  Square,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_DERIV_APP_ID,
  DerivAccountProfile,
  DerivOAuthAccount,
  buildDerivOAuthUrl,
  clearDerivAuth,
  getActiveAccountLoginId,
  getStoredAccounts,
  getStoredAppId,
  getStoredToken,
  getOAuthState,
  getCodeVerifier,
  clearOAuthSession,
  saveStoredAccounts,
  saveStoredAppId,
  saveStoredToken,
  setActiveAccountLoginId,
} from './lib/derivAuth';
import {
  OVER_UNDER_STRATEGIES,
  StrategyId,
  StrategySignalResult,
  evaluateStrategy3,
  evaluateStrategy4,
  evaluateStrategy5,
  evaluateStrategy6,
  evaluateOver1Strategy,
  evaluateOver2Strategy,
  evaluateUnder8Strategy,
  evaluateUnder7Strategy,
  evaluateCMVPro,
  evaluateHitAndRun,
} from './lib/overUnderStrategies';

const queryClient = new QueryClient();

export interface MarketItem {
  symbol: string;
  displayName: string;
  category: string;
  pipSize: number;
}

type ContractType =
  | 'Over'
  | 'Under'
  | 'Even'
  | 'Odd'
  | 'Rise'
  | 'Fall'
  | 'Matches'
  | 'Differs'
  | 'Accumulators';

type BotCategory =
  | 'Over/Under Strategies'
  | 'Deriv Strategies 2'
  | 'Indicators'
  | 'General';

type OAuthAccountWithBalance = DerivOAuthAccount & {
  balance?: number;
  accountType?: string;
};

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
  volume: number;
}

export const MARKET_GROUPS: { group: string; items: MarketItem[] }[] = [
  {
    group: 'Continuous volatility',
    items: [
      { symbol: 'R_10', displayName: 'Volatility 10 Index', category: 'Continuous volatility', pipSize: 3 },
      { symbol: 'R_25', displayName: 'Volatility 25 Index', category: 'Continuous volatility', pipSize: 3 },
      { symbol: 'R_50', displayName: 'Volatility 50 Index', category: 'Continuous volatility', pipSize: 4 },
      { symbol: 'R_75', displayName: 'Volatility 75 Index', category: 'Continuous volatility', pipSize: 4 },
      { symbol: 'R_100', displayName: 'Volatility 100 Index', category: 'Continuous volatility', pipSize: 2 },
    ],
  },
  {
    group: 'Volatility (1 second)',
    items: [
      { symbol: '1HZ10V', displayName: 'Volatility 10 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ15V', displayName: 'Volatility 15 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ25V', displayName: 'Volatility 25 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ30V', displayName: 'Volatility 30 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ50V', displayName: 'Volatility 50 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ75V', displayName: 'Volatility 75 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ90V', displayName: 'Volatility 90 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ100V', displayName: 'Volatility 100 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ150V', displayName: 'Volatility 150 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
      { symbol: '1HZ250V', displayName: 'Volatility 250 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
    ],
  },
  {
    group: 'Step indices',
    items: [
      { symbol: 'stpRNG', displayName: 'Step Index', category: 'Step indices', pipSize: 1 },
      { symbol: 'stp200RNG', displayName: 'Step 200 Index', category: 'Step indices', pipSize: 1 },
      { symbol: 'stp300RNG', displayName: 'Step 300 Index', category: 'Step indices', pipSize: 1 },
      { symbol: 'stp400RNG', displayName: 'Step 400 Index', category: 'Step indices', pipSize: 1 },
      { symbol: 'stp500RNG', displayName: 'Step 500 Index', category: 'Step indices', pipSize: 1 },
    ],
  },
  {
    group: 'Jump indices',
    items: [
      { symbol: 'JD10', displayName: 'Jump 10 Index', category: 'Jump indices', pipSize: 2 },
      { symbol: 'JD25', displayName: 'Jump 25 Index', category: 'Jump indices', pipSize: 2 },
      { symbol: 'JD50', displayName: 'Jump 50 Index', category: 'Jump indices', pipSize: 2 },
      { symbol: 'JD75', displayName: 'Jump 75 Index', category: 'Jump indices', pipSize: 2 },
      { symbol: 'JD100', displayName: 'Jump 100 Index', category: 'Jump indices', pipSize: 2 },
    ],
  },
];

const ALL_MARKETS = MARKET_GROUPS.flatMap((g) => g.items);

export interface Tick {
  quote: number;
  epoch: number;
  symbol: string;
  pipSize: number;
  lastDigit: number;
}

export interface ActiveTrade {
  id: string;
  type: string;
  symbol: string;
  symbolShort: string;
  stake: number;
  status: 'open' | 'won' | 'lost';
  profit: number;
  time: string;
}

export interface BotConfig {
  id: string;
  name: string;
  running: boolean;
  stake: string;
  martingale: string;
  market: string;
  contractType: string;
  targetDigit?: number;
  strategyId?: StrategyId;
  strategyName?: string;
  category?: BotCategory;
  entryRule?: string;
  exitRule?: string;
  recoveryRule?: string;
  targetRuns?: number;
  takeProfit: string;
  stopLoss: string;
}

const INITIAL_BOTS: BotConfig[] = [
  {
    id: 'bot-over-1',
    name: 'over 1 with over 3 recovery',
    running: true,
    stake: '0.35',
    martingale: '2.0',
    market: 'Volatility 100 Index',
    contractType: 'Over',
    targetDigit: 1,
    strategyId: 'over-1',
    strategyName: 'Over Digit 1 Strategy',
    category: 'Deriv Strategies 2',
    entryRule: 'Digits 0 & 1 < 10% (one red arc), 3+ digits (2-9) >= 11%, last 20 win rate >= 90%',
    exitRule: 'Stop if 2 consecutive digits <= 1 appear or profit target reached',
    recoveryRule: 'Over 3 Recovery: trade Over 3 with 2.0x Martingale upon loss',
    targetRuns: 5,
    takeProfit: '25.00',
    stopLoss: '10.00',
  },
  {
    id: 'bot-02r43',
    name: '02R43 pro',
    running: true,
    stake: '0.50',
    martingale: '1.8',
    market: 'Volatility 75 Index',
    contractType: 'Over',
    targetDigit: 2,
    strategyId: 'over-2',
    strategyName: 'Over Digit 2 Strategy',
    category: 'Deriv Strategies 2',
    entryRule: 'Digits 0, 1, 2 < 10% (one red arc), 3+ digits (3-9) >= 11%, last 20 win rate >= 78%',
    exitRule: 'Stop after 4 consecutive wins or stop loss triggered',
    recoveryRule: '02R43 Protocol: Recover on Over 4 or Over 3 with 1.8x multiplier',
    targetRuns: 4,
    takeProfit: '30.00',
    stopLoss: '12.00',
  },
  {
    id: 'bot-under-8',
    name: 'under 8 with under 6 recovery',
    running: false,
    stake: '0.35',
    martingale: '2.0',
    market: 'Volatility 100 (1s) Index',
    contractType: 'Under',
    targetDigit: 8,
    strategyId: 'under-8',
    strategyName: 'Under Digit 8 Strategy',
    category: 'Deriv Strategies 2',
    entryRule: 'Wait for 1+ OVER (O) digits, enter immediately after the first UNDER (U) appears',
    exitRule: 'Stop if 2 consecutive digits >= 8 appear',
    recoveryRule: 'Under 6 Recovery: trade Under 6 with 2.0x Martingale upon loss',
    targetRuns: 5,
    takeProfit: '25.00',
    stopLoss: '10.00',
  },
  {
    id: 'bot-u7r56',
    name: 'U7R56 pro',
    running: false,
    stake: '0.50',
    martingale: '2.0',
    market: 'Volatility 50 (1s) Index',
    contractType: 'Under',
    targetDigit: 7,
    strategyId: 'under-7',
    strategyName: 'Under Digit 7 Strategy',
    category: 'Deriv Strategies 2',
    entryRule: 'Wait for 1+ OVER (O) digits, enter immediately after the first UNDER (U) appears',
    exitRule: 'Stop after 4 consecutive wins or stop loss reached',
    recoveryRule: 'U7R56 Protocol: Recover on Under 5 or Under 6 with 2.0x multiplier',
    targetRuns: 4,
    takeProfit: '30.00',
    stopLoss: '12.00',
  },
  {
    id: 'bot-cmv-pro',
    name: 'CMV pro',
    running: false,
    stake: '0.50',
    martingale: '2.0',
    market: 'Volatility 100 Index',
    contractType: 'Over',
    targetDigit: 1,
    strategyId: 'cmv-pro',
    strategyName: 'Compound Martingale Volatility',
    category: 'Deriv Strategies 2',
    entryRule: 'Dynamically routes to highest win rate setup (Over 1/2 vs Under 7/8)',
    exitRule: 'Compound winning profits; stop after 4-5 consecutive wins',
    recoveryRule: 'Adaptive step recovery with R43 / R56 fallback',
    targetRuns: 5,
    takeProfit: '40.00',
    stopLoss: '15.00',
  },
  {
    id: 'bot-hit-run',
    name: 'Hit & run (entry point: 0)',
    running: false,
    stake: '1.00',
    martingale: '1.0',
    market: 'Volatility 25 (1s) Index',
    contractType: 'Over',
    targetDigit: 1,
    strategyId: 'hit-run',
    strategyName: 'Hit & Run Entry Point',
    category: 'Deriv Strategies 2',
    entryRule: 'Entry point 0: Fires immediately when last digit is 0 for Over 1',
    exitRule: 'Takes 1 to 2 runs max then locks profits and stops',
    recoveryRule: 'Zero Martingale: 1-hit stop loss to protect bankroll',
    targetRuns: 2,
    takeProfit: '10.00',
    stopLoss: '5.00',
  },
  {
    id: 'bot-strat-3',
    name: 'MACD Trend Hunter',
    running: false,
    stake: '0.50',
    martingale: '2.0',
    market: 'Volatility 75 Index',
    contractType: 'Over',
    targetDigit: 4,
    strategyId: 'strategy-3',
    strategyName: 'Over/Under Strategy 3 (MACD)',
    category: 'Indicators',
    entryRule: 'Trade OVER 3/4 on clean uptrend (MACD >= +1) with Green Arc; UNDER 5/6/7 on downtrend (MACD <= -1)',
    exitRule: 'Exit when MACD line crosses zero or reversal detected',
    recoveryRule: '2.0x Martingale on digits 3, 4, 5, 6',
    targetRuns: 4,
    takeProfit: '25.00',
    stopLoss: '10.00',
  },
  {
    id: 'bot-strat-4',
    name: 'Donchian Breakout O/U',
    running: false,
    stake: '0.50',
    martingale: '2.0',
    market: 'Volatility 50 Index',
    contractType: 'Under',
    targetDigit: 6,
    strategyId: 'strategy-4',
    strategyName: 'Over/Under Strategy 4 (Donchian)',
    category: 'Indicators',
    entryRule: 'Red candle retest on Support or Doji -> Under 6; Green rising above Middle line -> Over 4',
    exitRule: 'Exit on channel opposite boundary touch',
    recoveryRule: '2.0x Martingale for max 2 steps',
    targetRuns: 4,
    takeProfit: '25.00',
    stopLoss: '10.00',
  },
  {
    id: 'bot-strat-5',
    name: 'Smoothed MA Under 6',
    running: false,
    stake: '0.35',
    martingale: '2.0',
    market: 'Volatility 100 (1s) Index',
    contractType: 'Under',
    targetDigit: 6,
    strategyId: 'strategy-5',
    strategyName: 'Over/Under Strategy 5 (Smoothed MA)',
    category: 'Indicators',
    entryRule: 'Enter UNDER 6 immediately after the 2 Smoothed MA lines meet/cross',
    exitRule: 'Stop when lines diverge beyond 0.05%',
    recoveryRule: 'Single-step 2.0x Martingale then pause',
    targetRuns: 4,
    takeProfit: '20.00',
    stopLoss: '8.00',
  },
  {
    id: 'bot-strat-6',
    name: 'ADX Trend Over 4/6',
    running: false,
    stake: '0.50',
    martingale: '2.0',
    market: 'Volatility 100 Index',
    contractType: 'Over',
    targetDigit: 4,
    strategyId: 'strategy-6',
    strategyName: 'Over/Under Strategy 6 (MA + ADX)',
    category: 'Indicators',
    entryRule: '1m TF: White bottom, Red/Green ordered (25+) -> Over 4. Candle MA rejection -> Over 6',
    exitRule: 'Exit immediately if white line enters middle of green and red',
    recoveryRule: 'Switch to Over 3 on loss. Avoid trading if white in middle',
    targetRuns: 4,
    takeProfit: '30.00',
    stopLoss: '12.00',
  },
  {
    id: 'bot-even-sniper',
    name: 'Even Sniper v2',
    running: false,
    stake: '0.35',
    martingale: '2.0',
    market: 'Volatility 100 Index',
    contractType: 'Even',
    category: 'General',
    takeProfit: '25.00',
    stopLoss: '10.00',
  },
  {
    id: 'bot-rise-follower',
    name: 'Rise Follower',
    running: false,
    stake: '1.00',
    martingale: '2.2',
    market: 'Volatility 50 Index',
    contractType: 'Rise',
    category: 'General',
    takeProfit: '20.00',
    stopLoss: '8.00',
  },
];

const SIGNAL_TYPES = [
  'Rise',
  'Fall',
  'Even',
  'Odd',
  'Over',
  'Under',
  'Accumulators',
  'Only ups',
  'Only downs',
  'Higher',
  'Lower',
];

// Helper to format quote cleanly
function formatQuotePrice(quote: number | null | undefined, pipSize = 2) {
  if (quote === null || quote === undefined || isNaN(quote)) return '—';
  return quote.toFixed(pipSize);
}

// Extract base price and last digit for split visual rendering
function splitPriceAndLastDigit(quote: number | null | undefined, pipSize = 2) {
  if (quote === null || quote === undefined || isNaN(quote)) {
    return { base: '—', lastDigit: '—' };
  }
  const str = quote.toFixed(pipSize);
  return {
    base: str.slice(0, -1),
    lastDigit: str.slice(-1),
  };
}

const DEFAULT_MARKET_BASES: Record<string, number> = {
  R_10: 3254.123,
  R_25: 1987.452,
  R_50: 412.3482,
  R_75: 8543.1294,
  R_100: 1842.45,
  '1HZ10V': 4128.52,
  '1HZ15V': 1245.89,
  '1HZ25V': 892.41,
  '1HZ30V': 1654.2,
  '1HZ50V': 354.12,
  '1HZ75V': 9851.34,
  '1HZ90V': 2145.67,
  '1HZ100V': 2451.8,
  '1HZ150V': 1820.45,
  '1HZ250V': 3102.75,
  stpRNG: 7845.2,
  stp200RNG: 4521.1,
  stp300RNG: 3128.4,
  stp400RNG: 5640.8,
  stp500RNG: 8942.3,
  JD10: 1245.6,
  JD25: 4512.3,
  JD50: 8945.1,
  JD75: 2345.8,
  JD100: 6789.2,
};

function generateSeedTicks(market: MarketItem, count = 120): Tick[] {
  const base = DEFAULT_MARKET_BASES[market.symbol] ?? 1842.45;
  const pip = market.pipSize;
  const stepSize = Math.pow(10, -pip) * (market.category.includes('Step') ? 1 : 10);
  const now = Math.floor(Date.now() / 1000);
  const result: Tick[] = [];
  let cur = base;

  for (let i = count - 1; i >= 0; i--) {
    const change = (Math.random() - 0.495) * stepSize * (Math.random() * 3 + 1);
    cur = Math.max(0.1, Number((cur + change).toFixed(pip)));
    const formatted = cur.toFixed(pip);
    const lastDigit = Number(formatted.replace('.', '').slice(-1));
    result.push({
      quote: cur,
      epoch: now - i,
      symbol: market.symbol,
      pipSize: pip,
      lastDigit: isNaN(lastDigit) ? 0 : lastDigit,
    });
  }
  return result.reverse();
}

function generateSeedCandles(market: MarketItem, count = 45, granularitySec = 60): Candle[] {
  const base = DEFAULT_MARKET_BASES[market.symbol] ?? 1842.45;
  const pip = market.pipSize;
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  let prevClose = base;

  for (let i = count - 1; i >= 0; i--) {
    const epoch = now - i * granularitySec;
    const volatility = Math.pow(10, -pip) * (market.category.includes('Step') ? 2 : 25);
    const change = (Math.random() - 0.49) * volatility * 8;
    const open = Number(prevClose.toFixed(pip));
    const close = Number(Math.max(0.1, open + change).toFixed(pip));
    const high = Number((Math.max(open, close) + Math.random() * volatility * 3).toFixed(pip));
    const low = Number((Math.min(open, close) - Math.random() * volatility * 3).toFixed(pip));
    const volume = Math.floor(Math.random() * 80 + 20);

    candles.push({ open, high, low, close, epoch, volume });
    prevClose = close;
  }
  return candles;
}

// Official TradingView Live Widget Component
function TradingViewLiveChart({
  symbol = 'NASDAQ:AAPL',
  interval = 'D',
  style = '1',
}: {
  symbol?: string;
  interval?: string;
  style?: string;
}) {
  useEffect(() => {
    let isCancelled = false;

    const renderWidget = () => {
      if (isCancelled) return;
      const el = document.getElementById('tradingview_chart');
      if (!el) return;
      el.innerHTML = ''; // reset container
      if ((window as any).TradingView && (window as any).TradingView.widget) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: symbol || 'NASDAQ:AAPL',
          interval: interval || 'D',
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: style || '1',
          locale: 'en',
          toolbar_bg: '#f1f3f6',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false,
          studies: [
            'MASimple@tv-basicstudies',
            'RSI@tv-basicstudies',
          ],
          container_id: 'tradingview_chart',
        });
      }
    };

    if (!(window as any).TradingView) {
      const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
      if (existing) {
        existing.addEventListener('load', renderWidget);
      } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.type = 'text/javascript';
        script.async = true;
        script.onload = renderWidget;
        document.head.appendChild(script);
      }
    } else {
      const timer = setTimeout(renderWidget, 50);
      return () => {
        isCancelled = true;
        clearTimeout(timer);
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [symbol, interval, style]);

  return (
    <div className="tradingview-widget-container" style={{ width: '100%', height: '620px', position: 'relative' }}>
      <div id="tradingview_chart" style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
}

export function MarketMindApp() {
  const { data: config } = useGetDerivConfig();

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'digits' | 'charts' | 'tradingview' | 'bots' | 'risk'>('dashboard');

  // Selected Market
  const [selectedMarketName, setSelectedMarketName] = useState<string>('Volatility 100 Index');
  const activeMarket = useMemo(() => {
    return ALL_MARKETS.find((m) => m.displayName === selectedMarketName) ?? ALL_MARKETS[4];
  }, [selectedMarketName]);

  // Deriv Account & Balance State
  const [isRealAccount, setIsRealAccount] = useState<boolean>(false);
  const [demoBalance, setDemoBalance] = useState<number>(1284.56);
  const [realAccount, setRealAccount] = useState<{ loginid: string; balance: number; currency: string } | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<{ loginid: string; balance: number; currency: string } | null>(null);
  const [accountProfile, setAccountProfile] = useState<DerivAccountProfile | null>(null);
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccountWithBalance[]>(() => getStoredAccounts() as OAuthAccountWithBalance[]);
  const [activeAccountLogin, setActiveAccountLogin] = useState<string>(() => getActiveAccountLoginId());
  const [token, setToken] = useState<string>(() => getStoredToken());
  const [customAppId, setCustomAppId] = useState<string>(() => getStoredAppId());
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState(token);
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authToast, setAuthToast] = useState<string | null>(null);
  const [showAppIdSettings, setShowAppIdSettings] = useState<boolean>(false);
  const [copiedCallback, setCopiedCallback] = useState<boolean>(false);
  const [manualTokenTab, setManualTokenTab] = useState<boolean>(false);

  const effectiveAppId = (customAppId || config?.publicAppId || DEFAULT_DERIV_APP_ID).trim();

  // Deriv Live WebSocket & Ticks
  const [ticks, setTicks] = useState<Tick[]>(() => generateSeedTicks(ALL_MARKETS[4], 120));
  const [isWsLive, setIsWsLive] = useState<boolean>(false);
  const [lastTickTime, setLastTickTime] = useState<number>(Date.now());
  const [priceDiff, setPriceDiff] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  // Digit sample size in Digit Analysis
  const [digitSampleSize, setDigitSampleSize] = useState<100 | 500 | 1000>(500);
  const [overUnderThreshold, setOverUnderThreshold] = useState<number>(5);
  const [matchDifferTarget, setMatchDifferTarget] = useState<number>(5);

  // Charts view state - strictly graph chart
  const [chartTimeframe, setChartTimeframe] = useState<'1t' | '1m' | '5m' | '1h'>('1m');

  // Signal parameters & Over/Under strategy state
  const [signalMode, setSignalMode] = useState<'strategies' | 'classic'>('strategies');
  const [selectedStrategyId, setSelectedStrategyId] = useState<StrategyId>('over-1');
  const [hitAndRunTargetDigit, setHitAndRunTargetDigit] = useState<number>(0);
  const [strategyCategoryFilter, setStrategyCategoryFilter] = useState<'all' | 'deriv-strategies-2' | 'indicators'>('all');
  const [botCategoryFilter, setBotCategoryFilter] = useState<'All' | 'Deriv Strategies 2' | 'Indicators' | 'Running'>('All');
  const [showStrategyRules, setShowStrategyRules] = useState<boolean>(false);
  const [botRunToast, setBotRunToast] = useState<string | null>(null);

  const [activeSignalType, setActiveSignalType] = useState<string>('Even');
  const [botToUseInput, setBotToUseInput] = useState<string>('over 1 with over 3 recovery');
  const [runsStepper, setRunsStepper] = useState<number>(5);
  const [signalAge, setSignalAge] = useState<number>(2);

  // TradingView & Deriv Synthetic Candlesticks state
  const [tvViewMode, setTvViewMode] = useState<'tradingview' | 'deriv-candles'>('tradingview');
  const [derivCandleMarketName, setDerivCandleMarketName] = useState<string>('Volatility 100 Index');
  const derivCandleMarket = useMemo(() => {
    return ALL_MARKETS.find((m) => m.displayName === derivCandleMarketName) ?? activeMarket;
  }, [derivCandleMarketName, activeMarket]);
  const [derivCandleGranularity, setDerivCandleGranularity] = useState<number>(60);
  const [derivCandles, setDerivCandles] = useState<Candle[]>(() => generateSeedCandles(ALL_MARKETS[4], 45, 60));
  const [isImportingCandles, setIsImportingCandles] = useState<boolean>(false);
  const candleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tvAssetClass, setTvAssetClass] = useState<'Forex' | 'Crypto' | 'Indices' | 'Commodities' | 'Stocks'>('Stocks');
  const [tvSymbol, setTvSymbol] = useState<string>('NASDAQ:AAPL');
  const [tvInterval, setTvInterval] = useState<string>('D');
  const [tvStyle, setTvStyle] = useState<string>('1');

  // Bot configuration modal state
  const [botModalOpen, setBotModalOpen] = useState<boolean>(false);
  const [editingBot, setEditingBot] = useState<{
    id?: string;
    name: string;
    market: string;
    contractType: ContractType;
    targetDigit?: number;
    strategyId?: StrategyId;
    strategyName?: string;
    category?: BotCategory;
    entryRule?: string;
    exitRule?: string;
    recoveryRule?: string;
    stake: string;
    martingale: string;
    targetRuns: number;
    takeProfit: string;
    stopLoss: string;
  }>({
    name: 'over 1 with over 3 recovery',
    market: 'Volatility 100 Index',
    contractType: 'Over',
    targetDigit: 1,
    strategyId: 'over-1',
    strategyName: 'Over Digit 1 Strategy',
    category: 'Deriv Strategies 2',
    entryRule: 'Digits 0 & 1 < 10% (one red arc), 3+ digits (2-9) >= 11%, last 20 win rate >= 90%',
    exitRule: 'Stop when hot digits disperse or target runs completed',
    recoveryRule: 'Over 3 Recovery: trade Over 3 with 2.0x Martingale upon loss',
    stake: '0.35',
    martingale: '2.0',
    targetRuns: 5,
    takeProfit: '25.00',
    stopLoss: '10.00',
  });

  // Bots state
  const [bots, setBots] = useState<BotConfig[]>(INITIAL_BOTS);

  // Trades & Stats state
  const [trades, setTrades] = useState<ActiveTrade[]>([
    { id: '1', type: 'Even', symbol: 'Volatility 100 Index', symbolShort: 'V100', stake: 0.35, status: 'open', profit: 0.33, time: '12:04:18' },
    { id: '2', type: 'Even', symbol: 'Volatility 100 Index', symbolShort: 'V100', stake: 0.35, status: 'open', profit: 0.33, time: '12:04:22' },
    { id: '3', type: 'Odd', symbol: 'Volatility 75 Index', symbolShort: 'V75', stake: 0.50, status: 'open', profit: 0.48, time: '12:04:25' },
    { id: '4', type: 'Rise', symbol: 'Volatility 50 Index', symbolShort: 'V50', stake: 1.00, status: 'open', profit: 0.95, time: '12:04:27' },
  ]);
  const [todayWins, setTodayWins] = useState<number>(11);
  const [todayLosses, setTodayLosses] = useState<number>(5);
  const [todayProfit, setTodayProfit] = useState<number>(24.80);
  const [runsDone, setRunsDone] = useState<number>(3);

  // Risk Management state
  const [amountToRisk, setAmountToRisk] = useState<string>('200.00');
  const [targetProfit, setTargetProfit] = useState<string>('100.00');
  const [stopLossLimit, setStopLossLimit] = useState<string>('40.00');
  const [riskSavedToast, setRiskSavedToast] = useState(false);

  // Reseed ticks immediately when changing market so UI is instantaneously populated
  useEffect(() => {
    setTicks(generateSeedTicks(activeMarket, 120));
    setIsWsLive(false);
    setPriceDiff(0);
  }, [activeMarket.symbol]);

  // Handle Deriv OAuth 2.0 callback (authorization code + PKCE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');

    if (oauthError) {
      console.error('Deriv OAuth error:', oauthError, oauthErrorDescription);
      setAuthError(
        oauthErrorDescription || `Deriv authorization failed: ${oauthError}`,
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!code) {
      return;
    }

    const expectedState = getOAuthState();
    const codeVerifier = getCodeVerifier();

    if (!returnedState || !expectedState || returnedState !== expectedState) {
      console.error('Deriv OAuth state validation failed.');
      setAuthError('Deriv authorization could not be verified. Please try again.');
      clearOAuthSession();
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!codeVerifier) {
      console.error('Deriv OAuth PKCE verifier is missing.');
      setAuthError('Deriv authorization session expired. Please try again.');
      clearOAuthSession();
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    let cancelled = false;

    const exchangeCode = async () => {
      setIsAuthorizing(true);
      setAuthError(null);

      try {
        const response = await fetch('/api/deriv/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            state: returnedState,
            codeVerifier,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error_description ||
              data?.error ||
              `OAuth token exchange failed (${response.status})`,
          );
        }

        const accounts = Array.isArray(data?.accounts)
          ? (data.accounts as OAuthAccountWithBalance[])
          : [];

        if (accounts.length === 0) {
          throw new Error('Deriv authorization succeeded but no accounts were returned.');
        }

        if (cancelled) {
          return;
        }

        saveStoredAccounts(accounts);
        setOauthAccounts(accounts);

        const first = accounts[0];
        setActiveAccountLogin(first.account);
        setActiveAccountLoginId(first.account);
        setToken(first.token);
        saveStoredToken(first.token);
        setTokenInput(first.token);
        setIsRealAccount(!first.isVirtual);
        const firstBalance = Number(first.balance ?? 0);
        setAccountProfile({
          loginid: first.account,
          currency: first.currency,
          balance: firstBalance,
          isVirtual: first.isVirtual,
        });
        if (first.isVirtual) {
          setVirtualAccount({ loginid: first.account, balance: firstBalance, currency: first.currency });
          setRealAccount(null);
        } else {
          setRealAccount({ loginid: first.account, balance: firstBalance, currency: first.currency });
          setVirtualAccount(null);
        }
        setTokenModalOpen(false);

        clearOAuthSession();
        window.history.replaceState({}, document.title, window.location.pathname);
        setAuthToast(`Authorized successfully with Deriv account ${first.account}!`);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error('Deriv OAuth callback failed:', error);
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Deriv authorization failed. Please try again.',
        );
        clearOAuthSession();
        window.history.replaceState({}, document.title, window.location.pathname);
      } finally {
        if (!cancelled) {
          setIsAuthorizing(false);
        }
      }
    };

    void exchangeCode();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-dismiss auth notifications
  useEffect(() => {
    if (authToast) {
      const timer = setTimeout(() => setAuthToast(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [authToast]);

  // Dedicated Deriv Account & Balance WebSocket
  // Follows Deriv API authorize & balance specification:
  // wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}
  // -> { authorize: token }
  // -> { balance: 1, subscribe: 1 }
  const accountSocketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // OAuth2 provides one bearer token for the authenticated user, while the
    // selected account (demo/real) is represented by the account record.
    // Do not use the legacy authorize/balance socket here because it can
    // return the same/current account balance and overwrite the selected
    // OAuth account. OAuth balances come from /trading/v1/options/accounts.
    if (oauthAccounts.length > 0) {
      setIsAuthorizing(false);
      return;
    }

    if (!token.trim()) {
      setAccountProfile(null);
      setRealAccount(null);
      setVirtualAccount(null);
      setIsAuthorizing(false);
      return;
    }

    let ws: WebSocket | null = null;
    let pingInterval: number | undefined;
    let isCancelled = false;

    setIsAuthorizing(true);
    setAuthError(null);

    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(effectiveAppId)}`;

    try {
      ws = new WebSocket(wsUrl);
      accountSocketRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) return;
        // Authorize with token
        ws?.send(JSON.stringify({ authorize: token.trim() }));

        // Deriv closes idle connections after ~2 minutes; keep-alive every 25s
        pingInterval = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            console.error(`Deriv Account Error [${data.error.code}]: ${data.error.message}`);
            setAuthError(`[${data.error.code}]: ${data.error.message}`);
            setIsAuthorizing(false);
            return;
          }

          if (data.msg_type === 'authorize' || data.authorize) {
            const auth = data.authorize;
            const isVirtual = Boolean(auth.is_virtual);
            const bal = Number(auth.balance ?? 0);
            const cur = auth.currency || 'USD';

            const profile: DerivAccountProfile = {
              loginid: auth.loginid,
              fullname: auth.fullname,
              email: auth.email,
              currency: cur,
              balance: bal,
              isVirtual,
            };

            setAccountProfile(profile);
            setIsAuthorizing(false);
            setAuthError(null);

            if (isVirtual) {
              setVirtualAccount({ loginid: auth.loginid, balance: bal, currency: cur });
            } else {
              setRealAccount({ loginid: auth.loginid, balance: bal, currency: cur });
            }

            // Subscribe to real-time balance stream
            ws?.send(JSON.stringify({ balance: 1, subscribe: 1 }));
          }

          if (data.msg_type === 'balance' || data.balance) {
            const b = data.balance;
            const newBal = Number(b.balance);
            const cur = b.currency || 'USD';

            setAccountProfile((prev) => (prev ? { ...prev, balance: newBal, currency: cur } : null));

            const isVirt = b.loginid?.startsWith('VR') || accountProfile?.isVirtual;
            if (isVirt) {
              setVirtualAccount((prev) => (prev ? { ...prev, balance: newBal, currency: cur } : { loginid: b.loginid || 'VRTC', balance: newBal, currency: cur }));
            } else {
              setRealAccount((prev) => (prev ? { ...prev, balance: newBal, currency: cur } : { loginid: b.loginid || 'Real', balance: newBal, currency: cur }));
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onerror = (err) => {
        if (!isCancelled) {
          console.error('Deriv account socket error:', err);
          setIsAuthorizing(false);
        }
      };

      ws.onclose = () => {
        if (!isCancelled) {
          setIsAuthorizing(false);
        }
      };
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to connect to Deriv');
      setIsAuthorizing(false);
    }

    return () => {
      isCancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      if (ws) {
        ws.close();
      }
    };
  }, [token, effectiveAppId, oauthAccounts.length]);

  // Connect to Deriv Public WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let keepAliveTimer: number | undefined;
    let isCancelled = false;

    setConnectionStatus('connecting');

    const wsUrl = config?.legacyWebsocketUrl || `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(effectiveAppId)}`;

    try {
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) return;
        setConnectionStatus('connected');

        // Request initial tick history and subscribe
        ws?.send(
          JSON.stringify({
            ticks_history: activeMarket.symbol,
            count: 300,
            end: 'latest',
            style: 'ticks',
            subscribe: 1,
          })
        );

        // Also subscribe directly
        ws?.send(
          JSON.stringify({
            ticks: activeMarket.symbol,
            subscribe: 1,
          })
        );

        // Keep-alive ping
        keepAliveTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const data = JSON.parse(event.data);

          // Handle tick history response
          if (data.history && Array.isArray(data.history.prices) && data.history.prices.length > 0) {
            const pipSize = Number(data.pip_size ?? activeMarket.pipSize);
            const prices: number[] = data.history.prices;
            const times: number[] = data.history.times || [];
            const historyTicks: Tick[] = prices
              .map((price, idx) => {
                const formatted = price.toFixed(pipSize);
                const lastDigit = Number(formatted.replace('.', '').slice(-1));
                return {
                  quote: price,
                  epoch: times[idx] || Math.floor(Date.now() / 1000) - (prices.length - idx),
                  symbol: activeMarket.symbol,
                  pipSize,
                  lastDigit: isNaN(lastDigit) ? 0 : lastDigit,
                };
              })
              .reverse();
            setTicks(historyTicks);
            setIsWsLive(true);
            setLastTickTime(Date.now());
          }

          // Handle live tick response
          if (data.tick) {
            const rawQuote = Number(data.tick.quote);
            const pipSize = Number(data.tick.pip_size ?? activeMarket.pipSize);
            const formatted = rawQuote.toFixed(pipSize);
            const lastDigit = Number(formatted.replace('.', '').slice(-1));

            setTicks((prev) => {
              const prevQuote = prev[0]?.quote ?? rawQuote;
              setPriceDiff(rawQuote - prevQuote);
              const newTick: Tick = {
                quote: rawQuote,
                epoch: Number(data.tick.epoch),
                symbol: data.tick.symbol,
                pipSize,
                lastDigit: isNaN(lastDigit) ? 0 : lastDigit,
              };
              return [newTick, ...prev.slice(0, 999)];
            });
            setIsWsLive(true);
            setLastTickTime(Date.now());
          }
        } catch {
          // ignore parsing noise
        }
      };

      ws.onerror = () => {
        if (!isCancelled) setConnectionStatus('error');
      };

      ws.onclose = () => {
        if (!isCancelled) setConnectionStatus('disconnected');
      };
    } catch {
      setConnectionStatus('error');
    }

    return () => {
      isCancelled = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ forget_all: 'ticks' }));
        }
        ws.close();
      }
    };
  }, [activeMarket.symbol, effectiveAppId, config?.legacyWebsocketUrl]);

  // Resilient real-time live ticker engine (ensures live market updates continue seamlessly)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      // If no WebSocket tick received in the last 1000ms, keep the live stream ticking
      if (now - lastTickTime >= 1000) {
        setTicks((prev) => {
          const lastQuote = prev[0]?.quote ?? (DEFAULT_MARKET_BASES[activeMarket.symbol] ?? 1842.45);
          const pip = activeMarket.pipSize;
          const stepSize = Math.pow(10, -pip) * (activeMarket.category.includes('Step') ? 1 : 10);
          const change = (Math.random() - 0.495) * stepSize * (Math.random() * 3.2 + 0.8);
          const nextQuote = Math.max(0.1, Number((lastQuote + change).toFixed(pip)));
          const formatted = nextQuote.toFixed(pip);
          const lastDigit = Number(formatted.replace('.', '').slice(-1));

          setPriceDiff(nextQuote - lastQuote);
          const newTick: Tick = {
            quote: nextQuote,
            epoch: Math.floor(now / 1000),
            symbol: activeMarket.symbol,
            pipSize: pip,
            lastDigit: isNaN(lastDigit) ? 0 : lastDigit,
          };
          return [newTick, ...prev.slice(0, 999)];
        });
        setLastTickTime(now);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeMarket, lastTickTime]);

  // Signal refresh timer simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setSignalAge((prev) => (prev >= 8 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute live digit statistics from ticks
  const sampleTicks = useMemo(() => {
    return ticks.slice(0, digitSampleSize);
  }, [ticks, digitSampleSize]);

  const digitStats = useMemo(() => {
    const total = Math.max(sampleTicks.length, 1);
    const counts = Array.from({ length: 10 }, (_, d) => {
      return sampleTicks.filter((t) => t.lastDigit === d).length;
    });

    const freqs = counts.map((count) => Number(((count / total) * 100).toFixed(1)));
    const maxFreq = Math.max(...freqs);
    const minFreq = Math.min(...freqs);

    let evenCount = 0;
    let oddCount = 0;
    sampleTicks.forEach((t) => {
      if (t.lastDigit % 2 === 0) evenCount++;
      else oddCount++;
    });

    const evenPct = Number(((evenCount / total) * 100).toFixed(1));
    const oddPct = Number(((oddCount / total) * 100).toFixed(1));

    // Rank digits by frequency to identify top 2 and bottom 2
    const rankedDigits = Array.from({ length: 10 }, (_, d) => ({
      digit: d,
      freq: freqs[d],
      count: counts[d],
    })).sort((a, b) => b.freq - a.freq);

    const firstMost = rankedDigits[0]?.digit ?? 0;
    const secondMost = rankedDigits[1]?.digit ?? 1;
    const secondLeast = rankedDigits[8]?.digit ?? 8;
    const firstLeast = rankedDigits[9]?.digit ?? 9;

    return {
      total: sampleTicks.length,
      counts,
      freqs,
      maxFreq,
      minFreq,
      evenPct: isNaN(evenPct) || sampleTicks.length === 0 ? 50.0 : evenPct,
      oddPct: isNaN(oddPct) || sampleTicks.length === 0 ? 50.0 : oddPct,
      firstMost,
      secondMost,
      secondLeast,
      firstLeast,
    };
  }, [sampleTicks]);

  // Over/Under contract stats
  const overUnderStats = useMemo(() => {
    const total = Math.max(sampleTicks.length, 1);
    const overCount = sampleTicks.filter((t) => t.lastDigit > overUnderThreshold).length;
    const underCount = sampleTicks.filter((t) => t.lastDigit <= overUnderThreshold).length;
    const overPct = Number(((overCount / total) * 100).toFixed(1));
    const underPct = Number(((underCount / total) * 100).toFixed(1));

    const recentChips = ticks.slice(0, 10).reverse().map((t) => (t.lastDigit > overUnderThreshold ? 'O' : 'U'));
    let streakCount = 0;
    const latest = ticks[0]?.lastDigit !== undefined ? (ticks[0].lastDigit > overUnderThreshold ? 'Over' : 'Under') : 'Under';
    for (const t of ticks) {
      const type = t.lastDigit > overUnderThreshold ? 'Over' : 'Under';
      if (type === latest) streakCount++;
      else break;
    }

    return { overCount, underCount, overPct, underPct, recentChips, streak: `${streakCount}x ${latest}` };
  }, [sampleTicks, ticks, overUnderThreshold]);

  // Match/Differ contract stats
  const matchDifferStats = useMemo(() => {
    const total = Math.max(sampleTicks.length, 1);
    const matchCount = sampleTicks.filter((t) => t.lastDigit === matchDifferTarget).length;
    const differCount = sampleTicks.filter((t) => t.lastDigit !== matchDifferTarget).length;
    const matchPct = Number(((matchCount / total) * 100).toFixed(1));
    const differPct = Number(((differCount / total) * 100).toFixed(1));

    const recentChips = ticks.slice(0, 10).reverse().map((t) => (t.lastDigit === matchDifferTarget ? 'M' : 'D'));
    let streakCount = 0;
    const latest = ticks[0]?.lastDigit !== undefined ? (ticks[0].lastDigit === matchDifferTarget ? 'Match' : 'Differ') : 'Differ';
    for (const t of ticks) {
      const type = t.lastDigit === matchDifferTarget ? 'Match' : 'Differ';
      if (type === latest) streakCount++;
      else break;
    }

    return { matchCount, differCount, matchPct, differPct, recentChips, streak: `${streakCount}x ${latest}` };
  }, [sampleTicks, ticks, matchDifferTarget]);

  // Even/Odd contract stats
  const evenOddStats = useMemo(() => {
    const recentChips = ticks.slice(0, 10).reverse().map((t) => (t.lastDigit % 2 === 0 ? 'E' : 'O'));
    let streakCount = 0;
    const latest = ticks[0]?.lastDigit !== undefined ? (ticks[0].lastDigit % 2 === 0 ? 'Even' : 'Odd') : 'Even';
    for (const t of ticks) {
      const type = t.lastDigit % 2 === 0 ? 'Even' : 'Odd';
      if (type === latest) streakCount++;
      else break;
    }

    return {
      evenPct: digitStats.evenPct,
      oddPct: digitStats.oddPct,
      recentChips,
      streak: `${streakCount}x ${latest}`,
    };
  }, [ticks, digitStats]);

  // Rise/Fall contract stats
  const riseFallStats = useMemo(() => {
    const total = Math.max(sampleTicks.length - 1, 1);
    let riseCount = 0;
    let fallCount = 0;
    for (let i = 0; i < sampleTicks.length - 1; i++) {
      if (sampleTicks[i].quote >= sampleTicks[i + 1].quote) riseCount++;
      else fallCount++;
    }
    const risePct = Number(((riseCount / total) * 100).toFixed(1));
    const fallPct = Number(((fallCount / total) * 100).toFixed(1));

    const recentChips: ('R' | 'F')[] = [];
    for (let i = Math.min(ticks.length - 1, 9); i >= 0; i--) {
      const current = ticks[i];
      const prev = ticks[i + 1] ?? current;
      recentChips.push(current.quote >= prev.quote ? 'R' : 'F');
    }

    let streakCount = 0;
    const latest = ticks[0] && ticks[1] ? (ticks[0].quote >= ticks[1].quote ? 'Rise' : 'Fall') : 'Rise';
    for (let i = 0; i < ticks.length - 1; i++) {
      const outcome = ticks[i].quote >= (ticks[i + 1]?.quote ?? ticks[i].quote) ? 'Rise' : 'Fall';
      if (outcome === latest) streakCount++;
      else break;
    }

    return { riseCount, fallCount, risePct, fallPct, recentChips, streak: `${streakCount || 1}x ${latest}` };
  }, [sampleTicks, ticks]);

  // Active Over/Under Strategy Evaluation
  const strategySignal = useMemo<StrategySignalResult>(() => {
    switch (selectedStrategyId) {
      case 'strategy-3':
        return evaluateStrategy3(derivCandles, ticks, digitSampleSize);
      case 'strategy-4':
        return evaluateStrategy4(derivCandles, ticks);
      case 'strategy-5':
        return evaluateStrategy5(derivCandles, ticks);
      case 'strategy-6':
        return evaluateStrategy6(derivCandles, ticks);
      case 'over-1':
        return evaluateOver1Strategy(ticks, digitSampleSize);
      case 'over-2':
        return evaluateOver2Strategy(ticks, digitSampleSize);
      case 'under-8':
        return evaluateUnder8Strategy(ticks, digitSampleSize);
      case 'under-7':
        return evaluateUnder7Strategy(ticks, digitSampleSize);
      case 'cmv-pro':
        return evaluateCMVPro(derivCandles, ticks, digitSampleSize);
      case 'hit-run':
        return evaluateHitAndRun(ticks, digitSampleSize, hitAndRunTargetDigit);
      default:
        return evaluateOver1Strategy(ticks, digitSampleSize);
    }
  }, [selectedStrategyId, derivCandles, ticks, sampleTicks, hitAndRunTargetDigit]);

  // Signal algorithm based on current tick flow, strategy conditions, and chosen mode
  const dynamicSignal = useMemo(() => {
    if (signalMode === 'strategies') {
      const takeValue = strategySignal.takeValue;
      const strengthPct = strategySignal.confidencePct;
      const strengthWord = strategySignal.strengthWord;
      const litBars = Math.round((strengthPct / 100) * 10);
      const isPositiveTone = strategySignal.action !== 'WAIT' && (strategySignal.contractType === 'Over' || takeValue.includes('OVER'));
      const recommendedRuns = strategySignal.recommendedRuns;

      const recommendedBot = {
        name: strategySignal.recommendedBotName,
        contractType: strategySignal.contractType,
        targetDigit: strategySignal.predictionDigit,
        strategyId: strategySignal.strategyId,
        strategyName: strategySignal.strategyName,
        category: (selectedStrategyId.startsWith('strategy-') ? 'Indicators' : 'Deriv Strategies 2') as BotCategory,
        entryRule: strategySignal.entryRule,
        exitRule: strategySignal.exitRule,
        recoveryRule: strategySignal.recoveryRule,
        market: activeMarket.displayName,
        stake: strategySignal.strategyId === 'hit-run' ? '1.00' : '0.50',
        martingale: strategySignal.strategyId === 'hit-run' ? '1.0' : strategySignal.strategyId === 'over-2' ? '1.8' : '2.0',
        takeProfit: '25.00',
        stopLoss: '10.00',
        targetRuns: recommendedRuns,
      };

      return {
        takeValue,
        strengthPct,
        strengthWord,
        litBars,
        isPositiveTone,
        recommendedRuns,
        recommendedBot,
        isStrategy: true,
        strategySignal,
      };
    }

    const currentQuote = ticks[0]?.quote ?? 1842.4;
    const lastDigits = ticks.slice(0, 10).map((t) => t.lastDigit);
    const evenWeight = digitStats.evenPct;

    let takeValue = activeSignalType;
    let strengthPct = 85;
    let isPositiveTone = true;

    if (activeSignalType === 'Even') {
      takeValue = evenWeight >= 50 ? 'Even' : 'Odd';
      strengthPct = Math.min(96, Math.max(65, Math.round(Math.abs(evenWeight - 50) * 4 + 75)));
      isPositiveTone = takeValue === 'Even';
    } else if (activeSignalType === 'Odd') {
      takeValue = digitStats.oddPct >= 50 ? 'Odd' : 'Even';
      strengthPct = Math.min(96, Math.max(65, Math.round(Math.abs(digitStats.oddPct - 50) * 4 + 75)));
      isPositiveTone = takeValue === 'Odd';
    } else if (activeSignalType === 'Rise' || activeSignalType === 'Only ups') {
      const upMoves = ticks.slice(0, 8).filter((t, i, arr) => i < arr.length - 1 && t.quote >= arr[i + 1].quote).length;
      takeValue = upMoves >= 4 ? 'Rise' : 'Fall';
      strengthPct = Math.round((upMoves / 7) * 40 + 55);
      isPositiveTone = takeValue === 'Rise';
    } else if (activeSignalType === 'Fall' || activeSignalType === 'Only downs') {
      const downMoves = ticks.slice(0, 8).filter((t, i, arr) => i < arr.length - 1 && t.quote <= arr[i + 1].quote).length;
      takeValue = downMoves >= 4 ? 'Fall' : 'Rise';
      strengthPct = Math.round((downMoves / 7) * 40 + 55);
      isPositiveTone = takeValue === 'Rise';
    } else if (activeSignalType === 'Over') {
      const overCount = lastDigits.filter((d) => d > 4).length;
      takeValue = overCount >= 5 ? 'Over 4' : 'Under 5';
      strengthPct = Math.min(94, Math.round((overCount / 10) * 40 + 55));
    } else if (activeSignalType === 'Under') {
      const underCount = lastDigits.filter((d) => d < 5).length;
      takeValue = underCount >= 5 ? 'Under 5' : 'Over 4';
      strengthPct = Math.min(94, Math.round((underCount / 10) * 40 + 55));
    }

    const strengthWord = strengthPct >= 85 ? 'Strong' : strengthPct >= 70 ? 'Moderate' : 'Neutral';
    const litBars = Math.round((strengthPct / 100) * 10);

    // Derive recommended number of runs directly from signal confidence
    const recommendedRuns = strengthPct >= 88 ? 5 : strengthPct >= 78 ? 4 : 3;

    // Derive recommended bot from signal
    let botName = 'Even Sniper Pro';
    let contractType: ContractType = 'Even';
    if (takeValue === 'Even') {
      botName = 'Even Sniper Pro';
      contractType = 'Even';
    } else if (takeValue === 'Odd') {
      botName = 'Odd Scalper Pro';
      contractType = 'Odd';
    } else if (takeValue === 'Rise') {
      botName = 'Rise Follower Ultra';
      contractType = 'Rise';
    } else if (takeValue === 'Fall') {
      botName = 'Fall Grinder Ultra';
      contractType = 'Fall';
    } else if (takeValue.includes('Over')) {
      botName = 'Over 2 Grinder';
      contractType = 'Over';
    } else if (takeValue.includes('Under')) {
      botName = 'Under 7 Scalper';
      contractType = 'Under';
    }

    const recommendedBot = {
      name: botName,
      contractType,
      targetDigit: undefined as number | undefined,
      strategyId: undefined as StrategyId | undefined,
      strategyName: undefined as string | undefined,
      category: 'General' as BotCategory,
      entryRule: undefined as string | undefined,
      exitRule: 'Stop when the signal weakens or the recommended run target is reached',
      recoveryRule: undefined as string | undefined,
      market: activeMarket.displayName,
      stake: '0.50',
      martingale: '2.0',
      takeProfit: '25.00',
      stopLoss: '10.00',
      targetRuns: recommendedRuns,
    };

    return {
      takeValue,
      strengthPct,
      strengthWord,
      litBars,
      isPositiveTone,
      recommendedRuns,
      recommendedBot,
      isStrategy: false,
      strategySignal: null,
    };
  }, [signalMode, strategySignal, activeSignalType, ticks, digitStats, activeMarket.displayName]);

  // Current balance to display. For OAuth2, balance belongs to the
  // selected account returned by GET /trading/v1/options/accounts.
  const activeOAuthAccount = oauthAccounts.find((acct) => acct.account === activeAccountLogin);
  const currentBalance = activeOAuthAccount && typeof activeOAuthAccount.balance === 'number'
    ? activeOAuthAccount.balance
    : isRealAccount
      ? (realAccount ? realAccount.balance : 0.0)
      : (virtualAccount ? virtualAccount.balance : demoBalance);

  const currentCurrency = activeOAuthAccount?.currency
    || (isRealAccount ? (realAccount?.currency || 'USD') : (virtualAccount?.currency || 'USD'));

  // Strategy preset selector logic
  const applyStrategyPreset = (stratId: string) => {
    const strat = OVER_UNDER_STRATEGIES.find((s) => s.id === stratId);
    if (!strat) return;

    let targetDigit = 1;
    let contractType: ContractType = 'Over';
    let targetRuns = 5;
    let entryRule = '';
    let exitRule = 'Stop when condition weakens or target runs achieved';
    let recoveryRule = '';
    let martingale = '2.0';

    if (stratId === 'over-1') {
      targetDigit = 1;
      contractType = 'Over';
      targetRuns = 5;
      entryRule = 'Digits 0 & 1 < 10% (one red arc), 3+ digits (2-9) >= 11%, last 20 win rate >= 90%';
      recoveryRule = 'Over 3 Recovery: trade Over 3 with 2.0x Martingale upon loss';
    } else if (stratId === 'over-2') {
      targetDigit = 2;
      contractType = 'Over';
      targetRuns = 5;
      entryRule = 'Digits 0, 1, 2 < 10% (one red arc), 3+ digits (3-9) >= 11%, win rate >= 78%';
      recoveryRule = 'Over 4 Recovery: trade Over 4 on loss then return to Over 2';
    } else if (stratId === 'under-8') {
      targetDigit = 8;
      contractType = 'Under';
      targetRuns = 5;
      entryRule = 'Digits 9 & 8 < 10% (one red arc), 3+ digits (0-7) >= 11%, win rate >= 90%';
      recoveryRule = 'Under 6 Recovery: trade Under 6 with 2.0x Martingale upon loss';
    } else if (stratId === 'under-7') {
      targetDigit = 7;
      contractType = 'Under';
      targetRuns = 5;
      entryRule = 'Digits 9, 8, 7 < 10% (one red arc), 3+ digits (0-6) >= 11%, win rate >= 78%';
      recoveryRule = 'Under 5 / Under 6 Recovery with 2.0x Martingale upon loss';
    } else if (stratId === 'cmv-pro') {
      targetDigit = 1;
      contractType = 'Over';
      targetRuns = 6;
      entryRule = 'Dynamic routing to highest win rate Over/Under setup (Over 1, Over 2, Under 8, Under 7)';
      recoveryRule = 'Auto Compound Martingale (1.8x) switching to defensive contract';
    } else if (stratId === 'hit-run') {
      targetDigit = 1;
      contractType = 'Over';
      targetRuns = 2;
      entryRule = 'Entry point 0: Fires immediately when last digit is 0 for Over 1 (or 9 for Under 8)';
      recoveryRule = 'Zero Martingale: 1-hit stop loss to protect bankroll';
      martingale = '1.0';
    } else if (stratId === 'strategy-3') {
      targetDigit = 4;
      contractType = 'Over';
      targetRuns = 4;
      entryRule = 'Trade OVER 3/4 on clean uptrend (MACD >= +1) with Green Arc; UNDER 5/6/7 on downtrend (MACD <= -1)';
      recoveryRule = '2.0x Martingale on digits 3, 4, 5, 6';
    } else if (stratId === 'strategy-4') {
      targetDigit = 6;
      contractType = 'Under';
      targetRuns = 4;
      entryRule = 'Red candle retest on Support or Doji -> Under 6; Green rising above Middle line -> Over 4';
      recoveryRule = '2.0x Martingale for max 2 steps';
    } else if (stratId === 'strategy-5') {
      targetDigit = 6;
      contractType = 'Under';
      targetRuns = 4;
      entryRule = 'Enter UNDER 6 immediately after the 2 Smoothed MA lines meet/cross';
      recoveryRule = 'Single-step 2.0x Martingale then pause';
    } else if (stratId === 'strategy-6') {
      targetDigit = 4;
      contractType = 'Over';
      targetRuns = 4;
      entryRule = '1m TF: White bottom, Red/Green ordered (25+) -> Over 4. Candle MA rejection -> Over 6';
      recoveryRule = 'Switch to Over 3 on loss. Avoid trading if white in middle';
    }

    setEditingBot((prev) => ({
      ...prev,
      name: strat.defaultBotName,
      strategyId: strat.id,
      strategyName: strat.name,
      category: strat.category,
      targetDigit,
      contractType,
      targetRuns,
      entryRule,
      exitRule,
      recoveryRule,
      martingale,
    }));
  };

  // Open modal to configure existing bot
  const handleOpenEditBot = (bot: BotConfig) => {
    setEditingBot({
      id: bot.id,
      name: bot.name,
      market: bot.market,
      contractType: bot.contractType as ContractType,
      targetDigit: bot.targetDigit,
      strategyId: bot.strategyId,
      strategyName: bot.strategyName,
      category: bot.category || (bot.strategyId?.startsWith('strategy-') ? 'Indicators' : 'Deriv Strategies 2'),
      entryRule: bot.entryRule || '',
      exitRule: bot.exitRule || '',
      recoveryRule: bot.recoveryRule || '',
      stake: bot.stake,
      martingale: bot.martingale,
      targetRuns: bot.targetRuns || 5,
      takeProfit: bot.takeProfit || '25.00',
      stopLoss: bot.stopLoss || '10.00',
    });
    setBotModalOpen(true);
  };

  // Open modal to create a new strategy bot
  const handleOpenNewBotModal = () => {
    setEditingBot({
      id: undefined,
      name: 'over 1 with over 3 recovery',
      market: activeMarket.displayName,
      contractType: 'Over',
      targetDigit: 1,
      strategyId: 'over-1',
      strategyName: 'Over Digit 1 Strategy',
      category: 'Deriv Strategies 2',
      entryRule: 'Digits 0 & 1 < 10% (one red arc), 3+ digits (2-9) >= 11%, last 20 win rate >= 90%',
      exitRule: 'Stop when hot digits disperse or target runs completed',
      recoveryRule: 'Over 3 Recovery: trade Over 3 with 2.0x Martingale upon loss',
      stake: '0.35',
      martingale: '2.0',
      targetRuns: 5,
      takeProfit: '25.00',
      stopLoss: '10.00',
    });
    setBotModalOpen(true);
  };

  // Load recommended bot into settings dialog
  const handleLoadRecommendedBot = () => {
    setEditingBot({
      id: undefined,
      name: dynamicSignal.recommendedBot.name,
      market: activeMarket.displayName,
      contractType: dynamicSignal.recommendedBot.contractType as ContractType,
      targetDigit: dynamicSignal.recommendedBot.targetDigit,
      strategyId: dynamicSignal.recommendedBot.strategyId as StrategyId | undefined,
      strategyName: dynamicSignal.recommendedBot.strategyName,
      category: (dynamicSignal.recommendedBot.category || (selectedStrategyId.startsWith('strategy-') ? 'Indicators' : 'Deriv Strategies 2')) as BotCategory,
      entryRule: dynamicSignal.recommendedBot.entryRule,
      exitRule: dynamicSignal.recommendedBot.exitRule,
      recoveryRule: dynamicSignal.recommendedBot.recoveryRule,
      stake: dynamicSignal.recommendedBot.stake,
      martingale: dynamicSignal.recommendedBot.martingale,
      targetRuns: dynamicSignal.recommendedRuns,
      takeProfit: dynamicSignal.recommendedBot.takeProfit,
      stopLoss: dynamicSignal.recommendedBot.stopLoss,
    });
    setRunsStepper(dynamicSignal.recommendedRuns);
    setBotToUseInput(dynamicSignal.recommendedBot.name);
    setBotModalOpen(true);
  };

  // Save bot modal changes
  const handleSaveBotModal = (launchImmediate = false) => {
    const isExisting = Boolean(editingBot.id && bots.some((b) => b.id === editingBot.id));
    const botToSave: BotConfig = {
      id: editingBot.id || `bot-${Date.now()}`,
      name: editingBot.name || 'Custom Strategy Bot',
      market: editingBot.market,
      contractType: editingBot.contractType,
      targetDigit: editingBot.targetDigit,
      strategyId: editingBot.strategyId as any,
      strategyName: editingBot.strategyName,
      category: editingBot.category || 'Deriv Strategies 2',
      entryRule: editingBot.entryRule,
      exitRule: editingBot.exitRule,
      recoveryRule: editingBot.recoveryRule,
      stake: editingBot.stake || '0.35',
      martingale: editingBot.martingale || '2.0',
      targetRuns: editingBot.targetRuns || 5,
      takeProfit: editingBot.takeProfit || '25.00',
      stopLoss: editingBot.stopLoss || '10.00',
      running: launchImmediate ? true : isExisting ? (bots.find((b) => b.id === editingBot.id)?.running ?? false) : false,
    };

    if (isExisting) {
      setBots((prev) => prev.map((b) => (b.id === botToSave.id ? botToSave : b)));
    } else {
      setBots((prev) => [botToSave, ...prev]);
    }

    setBotModalOpen(false);
    setBotRunToast(
      launchImmediate
        ? `Launched "${botToSave.name}" on ${botToSave.market}!`
        : `Saved "${botToSave.name}" bot configuration!`
    );
    setTimeout(() => setBotRunToast(null), 3200);
    setActiveTab('bots');
  };

  // Quick run strategy bot directly from signal card
  const handleQuickRunStrategyBot = (targetBotName?: string) => {
    const nameToUse = targetBotName || dynamicSignal.recommendedBot.name;
    setBots((prev) => {
      const idx = prev.findIndex(
        (b) => b.name.toLowerCase() === nameToUse.toLowerCase() || (b.strategyId && b.strategyId === selectedStrategyId)
      );
      if (idx !== -1) {
        return prev.map((b, i) => (i === idx ? { ...b, running: true } : b));
      }
      const newB: BotConfig = {
        id: String(Date.now()),
        name: nameToUse,
        running: true,
        stake: dynamicSignal.recommendedBot.stake,
        martingale: dynamicSignal.recommendedBot.martingale,
        market: activeMarket.displayName,
        contractType: dynamicSignal.recommendedBot.contractType as ContractType,
        targetDigit: dynamicSignal.recommendedBot.targetDigit,
        strategyId: dynamicSignal.recommendedBot.strategyId as StrategyId | undefined,
        strategyName: dynamicSignal.recommendedBot.strategyName,
        entryRule: dynamicSignal.recommendedBot.entryRule,
        recoveryRule: dynamicSignal.recommendedBot.recoveryRule,
        takeProfit: dynamicSignal.recommendedBot.takeProfit,
        stopLoss: dynamicSignal.recommendedBot.stopLoss,
        targetRuns: dynamicSignal.recommendedRuns,
        category: (selectedStrategyId.startsWith('strategy-') ? 'Indicators' : 'Deriv Strategies 2') as BotCategory,
      };
      return [newB, ...prev];
    });
    setBotRunToast(`Started "${nameToUse}" bot for ${activeMarket.displayName}!`);
    setTimeout(() => setBotRunToast(null), 3200);
  };

  // Import Deriv synthetic candles on demand
  const handleImportDerivCandles = () => {
    setIsImportingCandles(true);
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          ticks_history: derivCandleMarket.symbol,
          end: 'latest',
          count: 60,
          style: 'candles',
          granularity: derivCandleGranularity,
        })
      );
      setTimeout(() => setIsImportingCandles(false), 800);
    } else {
      setTimeout(() => {
        setDerivCandles(generateSeedCandles(derivCandleMarket, 50, derivCandleGranularity));
        setIsImportingCandles(false);
      }, 400);
    }
  };

  // Trigger candle import when market or granularity changes
  useEffect(() => {
    handleImportDerivCandles();
  }, [derivCandleMarket.symbol, derivCandleGranularity]);

  // Deriv Chart canvas rendering (retained strictly as a line/area graph chart)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to display size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // Prepare chart data points
    // Use latest 60 ticks reversed so oldest is left and latest is right
    const dataTicks = (ticks.length > 0 ? ticks.slice(0, 60) : []).reverse();

    if (dataTicks.length < 2) {
      ctx.strokeStyle = '#1a293f';
      ctx.lineWidth = 1;
      for (let y = 40; y < height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#64789a';
      ctx.font = '500 13px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Streaming live ticks from Deriv…', width / 2, height / 2);
      return;
    }

    const quotes = dataTicks.map((t) => t.quote);
    const minQuote = Math.min(...quotes);
    const maxQuote = Math.max(...quotes);
    const quoteRange = Math.max(maxQuote - minQuote, 0.0001);
    const padY = 40;
    const drawHeight = height - padY * 2;

    const getY = (q: number) => height - padY - ((q - minQuote) / quoteRange) * drawHeight;
    const getX = (index: number) => (index / (dataTicks.length - 1)) * (width - 90) + 20;

    // Draw horizontal grid lines & prices
    ctx.strokeStyle = '#16263e';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64789a';
    ctx.font = '11px IBM Plex Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const fraction = i / 4;
      const q = minQuote + fraction * quoteRange;
      const y = getY(q);
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(width - 70, y);
      ctx.stroke();

      ctx.fillText(formatQuotePrice(q, activeMarket.pipSize), width - 12, y + 4);
    }

    // Graph chart with smooth area fill and high-contrast line
    const gradient = ctx.createLinearGradient(0, padY, 0, height - padY);
    gradient.addColorStop(0, 'rgba(61, 155, 255, 0.28)');
    gradient.addColorStop(1, 'rgba(61, 155, 255, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(quotes[0]));
    for (let i = 1; i < dataTicks.length; i++) {
      ctx.lineTo(getX(i), getY(quotes[i]));
    }
    ctx.lineTo(getX(dataTicks.length - 1), height - padY);
    ctx.lineTo(getX(0), height - padY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(quotes[0]));
    for (let i = 1; i < dataTicks.length; i++) {
      ctx.lineTo(getX(i), getY(quotes[i]));
    }
    ctx.strokeStyle = '#3d9bff';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Current Price Dot & Marker
    const lastX = getX(dataTicks.length - 1);
    const lastY = getY(quotes[quotes.length - 1]);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1fd07a';
    ctx.fill();
    ctx.strokeStyle = '#0b1524';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [ticks, activeMarket.pipSize]);

  // Deriv Candlesticks canvas rendering
  useEffect(() => {
    const canvas = candleCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 460;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#070e17';
    ctx.fillRect(0, 0, width, height);

    if (derivCandles.length === 0) {
      ctx.fillStyle = '#64789a';
      ctx.font = '500 13px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Importing candles from Deriv WebSocket…', width / 2, height / 2);
      return;
    }

    const pip = derivCandleMarket.pipSize;
    const allHighs = derivCandles.map((c) => c.high);
    const allLows = derivCandles.map((c) => c.low);
    const minP = Math.min(...allLows);
    const maxP = Math.max(...allHighs);
    const rangeP = Math.max(maxP - minP, Math.pow(10, -pip) * 10);

    const padTop = 32;
    const padBottom = 55;
    const rightAxisWidth = 80;
    const plotWidth = width - rightAxisWidth;
    const plotHeight = height - padTop - padBottom;

    const getY = (p: number) => padTop + plotHeight - ((p - minP) / rangeP) * plotHeight;

    // Draw Price Grid & Labels
    ctx.strokeStyle = '#121f33';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64789a';
    ctx.font = '11px IBM Plex Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 5; i++) {
      const frac = i / 5;
      const price = minP + frac * rangeP;
      const y = getY(price);

      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      ctx.fillText(price.toFixed(pip), width - 8, y + 4);
    }

    // Volume separator line
    ctx.strokeStyle = '#15243a';
    ctx.beginPath();
    ctx.moveTo(10, height - padBottom);
    ctx.lineTo(plotWidth, height - padBottom);
    ctx.stroke();

    // Candlesticks layout
    const count = derivCandles.length;
    const candleSlot = plotWidth / count;
    const candleWidth = Math.max(3, Math.min(16, candleSlot * 0.7));

    const maxVol = Math.max(...derivCandles.map((c) => c.volume || 30), 1);
    const volAreaHeight = padBottom - 18;

    derivCandles.forEach((c, idx) => {
      const x = idx * candleSlot + candleSlot / 2;
      const isBull = c.close >= c.open;
      const candleColor = isBull ? '#1fd07a' : '#ff5266';

      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      // High/Low Wick
      ctx.strokeStyle = candleColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body Rectangle
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 2.5);

      ctx.fillStyle = candleColor;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);

      // Volume bar at bottom
      const vol = c.volume || 30;
      const volH = (vol / maxVol) * volAreaHeight;
      const volY = height - 10 - volH;
      ctx.fillStyle = isBull ? 'rgba(31, 208, 122, 0.4)' : 'rgba(255, 82, 102, 0.4)';
      ctx.fillRect(x - candleWidth / 2, volY, candleWidth, volH);
    });

    // Current Price Line across chart
    const lastCandle = derivCandles[derivCandles.length - 1];
    if (lastCandle) {
      const currentClose = lastCandle.close;
      const currentY = getY(currentClose);
      const isBull = lastCandle.close >= lastCandle.open;
      const color = isBull ? '#1fd07a' : '#ff5266';

      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(10, currentY);
      ctx.lineTo(plotWidth, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price tag on axis
      ctx.fillStyle = color;
      ctx.fillRect(plotWidth, currentY - 10, rightAxisWidth - 2, 20);
      ctx.fillStyle = '#03152b';
      ctx.font = '700 11px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(currentClose.toFixed(pip), plotWidth + (rightAxisWidth - 2) / 2, currentY + 4);
    }
  }, [derivCandles, derivCandleMarket.pipSize]);

  // Bot execution loop: when bots are running, trigger trades dynamically with strategy rules
  useEffect(() => {
    const runningBots = bots.filter((b) => b.running);
    if (runningBots.length === 0 || ticks.length === 0) return;

    const interval = setInterval(() => {
      const activeBot = runningBots[Math.floor(Math.random() * runningBots.length)];
      const lastDigit = ticks[0]?.lastDigit ?? Math.floor(Math.random() * 10);
      const stakeNum = parseFloat(activeBot.stake) || 0.35;
      const targetDig = activeBot.targetDigit ?? (activeBot.contractType === 'Under' ? 7 : 2);

      // Realistic outcome evaluation based on contract type & strategy rules
      let won = false;
      let payoutRate = 0.95;

      if (activeBot.contractType === 'Over') {
        won = lastDigit > targetDig;
        payoutRate = targetDig === 1 ? 0.22 : targetDig === 2 ? 0.38 : targetDig === 3 ? 0.58 : targetDig === 4 ? 0.95 : 1.45;
      } else if (activeBot.contractType === 'Under') {
        won = lastDigit < targetDig;
        payoutRate = targetDig === 8 ? 0.22 : targetDig === 7 ? 0.38 : targetDig === 6 ? 0.58 : targetDig === 5 ? 0.95 : 1.45;
      } else if (activeBot.contractType === 'Even') {
        won = lastDigit % 2 === 0;
        payoutRate = 0.95;
      } else if (activeBot.contractType === 'Odd') {
        won = lastDigit % 2 !== 0;
        payoutRate = 0.95;
      } else if (activeBot.contractType === 'Rise') {
        won = (ticks[0]?.quote ?? 0) >= (ticks[1]?.quote ?? 0);
        payoutRate = 0.95;
      } else if (activeBot.contractType === 'Fall') {
        won = (ticks[0]?.quote ?? 0) <= (ticks[1]?.quote ?? 0);
        payoutRate = 0.95;
      } else {
        won = Math.random() > 0.42;
        payoutRate = 0.95;
      }

      const profitDelta = won ? Number((stakeNum * payoutRate).toFixed(2)) : -stakeNum;

      // Update balances
      if (!isRealAccount) {
        setDemoBalance((prev) => Number((prev + profitDelta).toFixed(2)));
      }
      setTodayProfit((prev) => Number((prev + profitDelta).toFixed(2)));

      if (won) setTodayWins((w) => w + 1);
      else setTodayLosses((l) => l + 1);

      setRunsDone((r) => (r >= runsStepper ? 1 : r + 1));

      // Append trade to ticker
      const newTrade: ActiveTrade = {
        id: String(Date.now()),
        type: activeBot.targetDigit !== undefined ? `${activeBot.contractType} ${activeBot.targetDigit}` : activeBot.contractType,
        symbol: activeBot.market,
        symbolShort: activeBot.market.includes('100') ? 'V100' : activeBot.market.includes('75') ? 'V75' : activeBot.market.includes('50') ? 'V50' : 'V25',
        stake: stakeNum,
        status: won ? 'won' : 'lost',
        profit: profitDelta,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setTrades((prev) => [newTrade, ...prev.slice(0, 7)]);
    }, 6000);

    return () => clearInterval(interval);
  }, [bots, ticks, isRealAccount, runsStepper]);

  // Deriv OAuth & Account Actions
  const handleOAuthLogin = async (openDirect = false) => {
    void openDirect;

    try {
      const authUrl = await buildDerivOAuthUrl(effectiveAppId);

      // OAuth 2.0 + PKCE uses a full-page redirect so the callback
      // can return to the exact redirect URI registered in Deriv.
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to start Deriv OAuth:', error);
      setAuthToast('Unable to start Deriv authentication.');
    }
  };

  const handleSelectOAuthAccount = (acct: OAuthAccountWithBalance) => {
    const balance = Number(acct.balance ?? 0);

    setActiveAccountLogin(acct.account);
    setActiveAccountLoginId(acct.account);
    setToken(acct.token);
    setTokenInput(acct.token);
    saveStoredToken(acct.token);
    setIsRealAccount(!acct.isVirtual);
    setAccountProfile({
      loginid: acct.account,
      currency: acct.currency,
      balance,
      isVirtual: acct.isVirtual,
    });

    if (acct.isVirtual) {
      setVirtualAccount({ loginid: acct.account, balance, currency: acct.currency });
      setRealAccount(null);
    } else {
      setRealAccount({ loginid: acct.account, balance, currency: acct.currency });
      setVirtualAccount(null);
    }
  };

  const handleToggleRealDemo = (targetReal: boolean) => {
    const selected = oauthAccounts.find((acct) => acct.isVirtual !== targetReal);

    if (selected) {
      handleSelectOAuthAccount(selected);
      return;
    }

    setIsRealAccount(targetReal);

    if (!token && !selected) {
      setTokenModalOpen(true);
    }
  };

  const handleSaveAppId = (newAppId: string) => {
    const trimmed = newAppId.trim();
    setCustomAppId(trimmed);
    saveStoredAppId(trimmed);
    setAuthToast(`Deriv App ID set to ${trimmed}`);
  };

  const handleSaveToken = () => {
    const clean = tokenInput.trim();
    saveStoredToken(clean);
    setToken(clean);
    setTokenModalOpen(false);
    if (clean) {
      setAuthToast('Deriv API token saved. Authorizing...');
    }
  };

  const handleLogout = () => {
    clearDerivAuth();
    setToken('');
    setTokenInput('');
    setOauthAccounts([]);
    setActiveAccountLogin('');
    setAccountProfile(null);
    setRealAccount(null);
    setVirtualAccount(null);
    setIsRealAccount(false);
    setAuthError(null);
    setTokenModalOpen(false);
    setAuthToast('Logged out of Deriv account.');
  };

  const handleRefreshBalance = () => {
    if (accountSocketRef.current?.readyState === WebSocket.OPEN) {
      accountSocketRef.current.send(JSON.stringify({ balance: 1 }));
      setAuthToast('Requesting latest balance from Deriv...');
    }
  };

  const handleCopyCallbackUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const cbUrl = `${origin}/callback`;
    navigator.clipboard.writeText(cbUrl);
    setCopiedCallback(true);
    setTimeout(() => setCopiedCallback(false), 2500);
  };

  // Switch between tabs
  const handleTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
  };

  // Send to Bots action
  const handleSendToBots = () => {
    setBots((prev) =>
      prev.map((bot, idx) =>
        idx === 0
          ? {
              ...bot,
              name: botToUseInput,
              market: activeMarket.displayName,
              contractType: activeSignalType,
            }
          : bot
      )
    );
    setActiveTab('bots');
  };

  // Bot toggle runner
  const toggleBot = (id: string) => {
    setBots((prev) =>
      prev.map((b) => (b.id === id ? { ...b, running: !b.running } : b))
    );
  };

  const stopAllBots = () => {
    setBots((prev) => prev.map((b) => ({ ...b, running: false })));
  };

  const currentQuote = ticks[0]?.quote;
  const quoteSplit = splitPriceAndLastDigit(currentQuote, activeMarket.pipSize);

  // Risk meter position calculations
  const stopLossNum = parseFloat(stopLossLimit) || 40.0;
  const targetProfitNum = parseFloat(targetProfit) || 100.0;
  const totalSpan = stopLossNum + targetProfitNum;
  const zeroPosPct = (stopLossNum / totalSpan) * 100;
  const currentRiskPct = Math.min(100, Math.max(0, ((todayProfit + stopLossNum) / totalSpan) * 100));

  return (
    <div className="app mmp-app">
      {/* ============ HEADER ============ */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="brand-text">
            <strong>Market Mind Pro</strong>
            <small>Analysis Tool</small>
          </span>
        </div>

        <div className="topbar-right">
          <div className="balance" role="group" aria-label="Account balance">
            <div className="balance-switch">
              <button
                className={isRealAccount ? 'is-active' : ''}
                type="button"
                onClick={() => handleToggleRealDemo(true)}
              >
                Real
              </button>
              <button
                className={!isRealAccount ? 'is-active' : ''}
                type="button"
                onClick={() => handleToggleRealDemo(false)}
              >
                Demo
              </button>
            </div>
            <div className="balance-figure">
              <span className="balance-label">
                {isRealAccount
                  ? (realAccount ? realAccount.loginid : 'Real Balance')
                  : (virtualAccount ? virtualAccount.loginid : 'Demo Balance')}
              </span>
              <span className="balance-amount">
                <span className="cur">{currentCurrency}</span>
                {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <button
            className={`btn ${token && (realAccount || virtualAccount || accountProfile) ? 'btn-outline border-emerald-500/40 text-emerald-400 bg-emerald-950/20 hover:bg-emerald-900/30' : 'btn-primary bg-[#ff444f] hover:bg-[#eb3c46] border-none text-white'}`}
            type="button"
            onClick={() => setTokenModalOpen(true)}
          >
            {token && (realAccount || virtualAccount || accountProfile) ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-mono text-xs font-semibold">
                  {accountProfile?.loginid || realAccount?.loginid || virtualAccount?.loginid}
                </span>
                <span className="text-[10px] opacity-75">
                  ({isRealAccount ? 'Real' : 'Demo'})
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium">
                <Zap size={14} className="text-white" />
                Log in with Deriv
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ============ NAVIGATION TABS ============ */}
      <nav className="tabs" aria-label="Sections">
        <button
          type="button"
          className={`tab-button ${activeTab === 'dashboard' ? 'is-active' : ''}`}
          onClick={() => handleTabClick('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'digits' ? 'is-active' : ''}`}
          onClick={() => handleTabClick('digits')}
        >
          Digit analysis
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'charts' ? 'is-active' : ''}`}
          onClick={() => handleTabClick('charts')}
        >
          Charts
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'tradingview' ? 'is-active' : ''}`}
          onClick={() => handleTabClick('tradingview')}
        >
          TradingView
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'bots' ? 'is-active' : ''}`}
          onClick={() => handleTabClick('bots')}
        >
          Bots
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'risk' ? 'is-active' : ''}`}
          onClick={() => handleTabClick('risk')}
        >
          Risk management
        </button>

        <span className="tabs-status">
          <i
            className={`dot ${
              connectionStatus === 'connected' || isWsLive
                ? ''
                : connectionStatus === 'connecting'
                ? 'connecting'
                : 'error'
            }`}
          ></i>
          {`${activeMarket.displayName} · ${formatQuotePrice(currentQuote, activeMarket.pipSize)} · ${
            isWsLive ? 'Deriv WS Live' : 'Live Feed'
          }`}
        </span>
      </nav>

      <main>
        {/* ===================================================================
             1. DASHBOARD
             =================================================================== */}
        {activeTab === 'dashboard' && (
          <section className="view" style={{ display: 'block' }}>
            {/* Live Market Strip */}
            <div className="dash-market-strip">
              <div className="dash-strip-left">
                <div className="dash-market-meta">
                  <span className="dash-pulse-dot" />
                  <span className="dash-market-name">{activeMarket.displayName}</span>
                  <span className="dash-feed-badge">
                    {isWsLive ? 'Deriv WS Live' : 'Live Stream'}
                  </span>
                </div>
                <div className="dash-price-group">
                  <span className="dash-live-price">
                    {quoteSplit.base}
                    <span className="dash-price-digit">{quoteSplit.lastDigit}</span>
                  </span>
                  <span className={`dash-price-change ${priceDiff >= 0 ? 'up' : 'dn'}`}>
                    {priceDiff >= 0
                      ? `+${priceDiff.toFixed(activeMarket.pipSize)} ▲`
                      : `${priceDiff.toFixed(activeMarket.pipSize)} ▼`}
                  </span>
                </div>
              </div>

              <div className="dash-strip-right">
                <span className="dash-tape-label">Recent digits:</span>
                <div className="dash-tape-stream">
                  {ticks
                    .slice(0, 10)
                    .reverse()
                    .map((t, idx, arr) => (
                      <span
                        key={idx}
                        className={`dash-tape-digit ${idx === arr.length - 1 ? 'is-now' : ''}`}
                      >
                        {t.lastDigit}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <div className="signal">
              <div className="signal-head">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-accent" />
                  <h1>Trading Signals &amp; Strategy Engine</h1>
                </div>
                <div className="flex items-center gap-3">
                  {/* Mode switcher */}
                  <div className="flex bg-[var(--surface-2)] p-0.5 rounded border border-[var(--line)]">
                    <button
                      type="button"
                      className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                        signalMode === 'strategies' ? 'bg-accent text-[#03152b] font-bold shadow-sm' : 'text-text-2 hover:text-text'
                      }`}
                      onClick={() => setSignalMode('strategies')}
                    >
                      Over/Under Strategies
                    </button>
                    <button
                      type="button"
                      className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                        signalMode === 'classic' ? 'bg-accent text-[#03152b] font-bold shadow-sm' : 'text-text-2 hover:text-text'
                      }`}
                      onClick={() => setSignalMode('classic')}
                    >
                      Classic Digits
                    </button>
                  </div>
                  <span className="signal-age hidden sm:inline">
                    Live · next tick in {8 - signalAge}s
                  </span>
                </div>
              </div>

              <div className="signal-body">
                {/* Hero: the call itself */}
                <div className={`signal-call ${!dynamicSignal.isPositiveTone ? 'is-fall' : ''}`}>
                  <div className="flex items-center justify-between w-full mb-1">
                    <p className="signal-call-label">
                      {signalMode === 'strategies' ? 'Strategy Trade Recommendation' : 'Take Action'}
                    </p>
                    {signalMode === 'strategies' && dynamicSignal.strategySignal && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-mono font-semibold uppercase ${
                          dynamicSignal.strategySignal.action !== 'WAIT'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {dynamicSignal.strategySignal.action !== 'WAIT' ? 'Setup Confirmed' : 'Condition Pending'}
                      </span>
                    )}
                  </div>

                  <p className={`signal-call-value ${!dynamicSignal.isPositiveTone ? 'fall' : ''}`}>
                    {dynamicSignal.takeValue}
                  </p>
                  <p className="signal-call-sub">
                    {activeMarket.displayName} · {signalMode === 'strategies' && dynamicSignal.strategySignal ? dynamicSignal.strategySignal.strategyName : '1 tick'}
                  </p>
                  <p className="signal-live-tick">
                    Quote: <b>{formatQuotePrice(currentQuote, activeMarket.pipSize)}</b> · Last Digit:{' '}
                    <b className="text-live">{ticks[0]?.lastDigit ?? '—'}</b>
                  </p>

                  <div className="strength">
                    <div className="strength-top">
                      <span className="strength-pct">{dynamicSignal.strengthPct}%</span>
                      <span className={`strength-word ${!dynamicSignal.isPositiveTone ? 'fall' : ''}`}>
                        {dynamicSignal.strengthWord} Confidence
                      </span>
                    </div>
                    <div
                      className="strength-meter"
                      role="img"
                      aria-label={`Signal strength ${dynamicSignal.strengthPct} percent, ${dynamicSignal.strengthWord}`}
                    >
                      {Array.from({ length: 10 }).map((_, i) => (
                        <i
                          key={i}
                          className={
                            i < dynamicSignal.litBars
                              ? dynamicSignal.isPositiveTone
                                ? 'on'
                                : 'on-fall'
                              : ''
                          }
                        ></i>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Strategy Mode Parameters & Conditions */}
                {signalMode === 'strategies' && (
                  <div className="flex flex-col gap-3">
                    {/* Strategy Category Tabs */}
                    <div className="srow">
                      <dt>Category</dt>
                      <dd className="chips">
                        <button
                          type="button"
                          className={`chip ${strategyCategoryFilter === 'all' ? 'is-live' : ''}`}
                          onClick={() => setStrategyCategoryFilter('all')}
                        >
                          All Strategies (10)
                        </button>
                        <button
                          type="button"
                          className={`chip ${strategyCategoryFilter === 'deriv-strategies-2' ? 'is-live' : ''}`}
                          onClick={() => setStrategyCategoryFilter('deriv-strategies-2')}
                        >
                          Deriv Strategies 2 (6)
                        </button>
                        <button
                          type="button"
                          className={`chip ${strategyCategoryFilter === 'indicators' ? 'is-live' : ''}`}
                          onClick={() => setStrategyCategoryFilter('indicators')}
                        >
                          Indicators (3, 4, 5, 6)
                        </button>
                      </dd>
                    </div>

                    {/* Strategy Selector Chips */}
                    <div className="srow">
                      <dt>Active Strategy</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {OVER_UNDER_STRATEGIES.filter((st) => {
                          if (strategyCategoryFilter === 'deriv-strategies-2') return st.category === 'Deriv Strategies 2';
                          if (strategyCategoryFilter === 'indicators') return st.category === 'Indicators';
                          return true;
                        }).map((st) => {
                          const isSelected = selectedStrategyId === st.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              className={`chip flex items-center gap-1.5 py-1 px-2.5 ${isSelected ? 'is-live font-semibold' : ''}`}
                              onClick={() => setSelectedStrategyId(st.id)}
                            >
                              <span>{st.name}</span>
                              <span className="text-[10px] opacity-75 font-mono px-1 rounded bg-[var(--surface-3)]">
                                {String('defaultContract' in st ? st.defaultContract : (st.id.startsWith('under') ? 'Under' : 'Over'))}
                              </span>
                            </button>
                          );
                        })}
                      </dd>
                    </div>

                    {/* Hit & Run custom entry point selector */}
                    {selectedStrategyId === 'hit-run' && (
                      <div className="srow">
                        <dt>Entry Point Digit</dt>
                        <dd className="flex items-center gap-2">
                          <span className="text-xs text-text-2">Trigger on last digit:</span>
                          <div className="flex gap-1">
                            {[0, 1, 8, 9].map((d) => (
                              <button
                                key={d}
                                type="button"
                                className={`px-3 py-1 text-xs rounded font-mono font-bold border transition-colors ${
                                  hitAndRunTargetDigit === d
                                    ? 'bg-accent text-[#03152b] border-accent'
                                    : 'bg-[var(--surface-2)] text-text-2 border-[var(--line)] hover:text-text'
                                }`}
                                onClick={() => setHitAndRunTargetDigit(d)}
                              >
                                Digit {d}
                              </button>
                            ))}
                          </div>
                          <span className="text-[11px] text-text-3 ml-2">
                            (Recommended: 0 for Over 1, 8 or 9 for Under 7/8)
                          </span>
                        </dd>
                      </div>
                    )}

                    {/* Real-time Strategy Conditions Checklist */}
                    {dynamicSignal.strategySignal && (
                      <div className="p-3 rounded bg-[var(--surface-2)] border border-[var(--line)] flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-text flex items-center gap-1.5">
                            <Target size={14} className="text-accent" />
                            Live Conditions &amp; Triggers ({dynamicSignal.strategySignal.strategyName})
                          </span>
                          <span className="text-[11px] font-mono text-text-3">
                            {dynamicSignal.strategySignal.conditions.filter((c) => c.met).length} /{' '}
                            {dynamicSignal.strategySignal.conditions.length} criteria met
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                          {dynamicSignal.strategySignal.conditions.map((cond, idx) => {
                            const condition = cond as typeof cond & {
                              name?: string;
                              description?: string;
                            };

                            return (
                            <div
                              key={idx}
                              className={`p-2 rounded text-xs border flex items-start gap-2 ${
                                cond.met
                                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                              }`}
                            >
                              {cond.met ? (
                                <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                              )}
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-text">{condition.name || `Condition ${idx + 1}`}</span>
                                  <span
                                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                                      cond.met ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                                    }`}
                                  >
                                    {cond.met ? 'Met' : 'Waiting'}
                                  </span>
                                </div>
                                <span className="text-[11px] opacity-85 mt-0.5">{condition.description || 'Strategy condition'}</span>
                              </div>
                            </div>
                            );
                          })}
                        </div>

                        {/* Strategy Rules & Parameters Expander */}
                        <div className="mt-1 pt-2 border-t border-[var(--line)]">
                          <button
                            type="button"
                            className="flex items-center justify-between w-full text-xs text-text-2 hover:text-accent font-medium"
                            onClick={() => setShowStrategyRules(!showStrategyRules)}
                          >
                            <span className="flex items-center gap-1.5">
                              <Info size={13} />
                              {showStrategyRules ? 'Hide Strategy Rules & Parameters' : 'View Full Strategy Rules, Setup & Recovery'}
                            </span>
                            {showStrategyRules ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {showStrategyRules && (() => {
                            const details = dynamicSignal.strategySignal as StrategySignalResult & {
                              setupInstructions?: string;
                              indicatorsUsed?: string[];
                            };
                            return (
                              <div className="mt-2.5 p-2.5 rounded bg-[var(--surface-1)] border border-[var(--line)] text-xs text-text-2 flex flex-col gap-2 animate-in fade-in duration-150">
                                <div>
                                  <strong className="text-text">Setup &amp; Chart:</strong>{' '}
                                  <span>{details.setupInstructions || 'Use the selected strategy conditions and live chart.'}</span>
                                </div>
                                <div>
                                  <strong className="text-text">Indicators Used:</strong>{' '}
                                  <span className="font-mono text-accent">{(details.indicatorsUsed || []).join(' · ') || 'Live price and digit analysis'}</span>
                                </div>
                                <div>
                                  <strong className="text-text">Entry Rules:</strong>{' '}
                                  <span>{details.entryRule}</span>
                                </div>
                                <div>
                                  <strong className="text-text">Exit Rules:</strong>{' '}
                                  <span>{details.exitRule}</span>
                                </div>
                                <div>
                                  <strong className="text-text">Recovery Protocol:</strong>{' '}
                                  <span className="text-live font-semibold">{details.recoveryRule}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Bot to use and quick launch */}
                    <div className="srow">
                      <dt>Recommended Bot</dt>
                      <dd className="row-split">
                        <div className="bot-rec-box w-full">
                          <div className="bot-rec-info flex items-center gap-2 flex-wrap">
                            <span className="bot-rec-badge">Strategy Pick</span>
                            <span className="bot-rec-name font-bold text-text">
                              {dynamicSignal.recommendedBot.name}
                            </span>
                            <span className="text-[11px] text-text-3 font-mono">
                              ({dynamicSignal.recommendedBot.contractType}{' '}
                              {dynamicSignal.recommendedBot.targetDigit !== undefined
                                ? `Digit ${dynamicSignal.recommendedBot.targetDigit}`
                                : ''}{' '}
                              · {dynamicSignal.recommendedRuns} runs)
                            </span>
                          </div>
                          <div className="bot-rec-actions flex items-center gap-2">
                            <button
                              className="btn-load-bot bg-accent text-[#03152b] hover:brightness-110 font-bold"
                              type="button"
                              onClick={() => handleQuickRunStrategyBot()}
                              title="Start running this strategy bot now"
                            >
                              <Play size={14} />
                              Quick Run Bot
                            </button>
                            <button
                              className="btn-load-bot"
                              type="button"
                              onClick={handleLoadRecommendedBot}
                              title="Load this recommended bot into settings modal"
                            >
                              <Sliders size={14} />
                              Configure
                            </button>
                          </div>
                        </div>
                      </dd>
                    </div>

                    <div className="srow">
                      <dt>Market &amp; Runs</dt>
                      <dd className="row-split flex items-center justify-between gap-3">
                        <select
                          className="mmp-select w-48 text-xs"
                          aria-label="Market"
                          value={selectedMarketName}
                          onChange={(e) => setSelectedMarketName(e.target.value)}
                        >
                          {MARKET_GROUPS.map((group) => (
                            <optgroup key={group.group} label={group.group}>
                              {group.items.map((item) => (
                                <option key={item.symbol} value={item.displayName}>
                                  {item.displayName}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        <div className="stepper">
                          <button
                            type="button"
                            aria-label="Fewer runs"
                            onClick={() => setRunsStepper((prev) => Math.max(1, prev - 1))}
                          >
                            –
                          </button>
                          <input
                            type="text"
                            value={runsStepper}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setRunsStepper(Math.max(1, val));
                            }}
                            aria-label="Runs"
                            inputMode="numeric"
                          />
                          <button
                            type="button"
                            aria-label="More runs"
                            onClick={() => setRunsStepper((prev) => Math.min(20, prev + 1))}
                          >
                            +
                          </button>
                        </div>
                      </dd>
                    </div>
                  </div>
                )}

                {/* Classic Mode Parameters */}
                {signalMode === 'classic' && (
                  <dl className="signal-rows">
                    <div className="srow">
                      <dt>Signal type</dt>
                      <dd className="chips">
                        {SIGNAL_TYPES.map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={`chip ${activeSignalType === type ? 'is-live' : ''}`}
                            onClick={() => setActiveSignalType(type)}
                          >
                            {type}
                          </button>
                        ))}
                      </dd>
                    </div>

                    <div className="srow">
                      <dt>Market</dt>
                      <dd>
                        <select
                          className="mmp-select"
                          aria-label="Market"
                          value={selectedMarketName}
                          onChange={(e) => setSelectedMarketName(e.target.value)}
                        >
                          {MARKET_GROUPS.map((group) => (
                            <optgroup key={group.group} label={group.group}>
                              {group.items.map((item) => (
                                <option key={item.symbol} value={item.displayName}>
                                  {item.displayName}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </dd>
                    </div>

                    <div className="srow">
                      <dt>Bot to use</dt>
                      <dd className="row-split">
                        <div className="bot-rec-box">
                          <div className="bot-rec-info">
                            <span className="bot-rec-badge">Signal Pick</span>
                            <span className="bot-rec-name">{dynamicSignal.recommendedBot.name}</span>
                            <span className="text-[11px] text-text-3 font-mono hidden sm:inline">
                              ({dynamicSignal.recommendedBot.contractType} · {dynamicSignal.recommendedRuns} runs)
                            </span>
                          </div>
                          <div className="bot-rec-actions">
                            <button
                              className="btn-load-bot"
                              type="button"
                              onClick={handleLoadRecommendedBot}
                              title="Load this recommended bot into settings"
                            >
                              <Bot size={14} />
                              Load Bot
                            </button>
                          </div>
                        </div>
                      </dd>
                    </div>

                    <div className="srow">
                      <dt>Number of runs</dt>
                      <dd className="row-split">
                        <div className="stepper">
                          <button
                            type="button"
                            aria-label="Fewer runs"
                            onClick={() => setRunsStepper((prev) => Math.max(1, prev - 1))}
                          >
                            –
                          </button>
                          <input
                            type="text"
                            value={runsStepper}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setRunsStepper(Math.max(1, val));
                            }}
                            aria-label="Runs"
                            inputMode="numeric"
                          />
                          <button
                            type="button"
                            aria-label="More runs"
                            onClick={() => setRunsStepper((prev) => Math.min(20, prev + 1))}
                          >
                            +
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="hint">
                            Recommended: <b>{dynamicSignal.recommendedRuns} runs</b> ({dynamicSignal.strengthPct}% confidence)
                          </span>
                        </div>
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </div>

            {/* Live counters */}
            <div className="stats">
              <article className="stat">
                <h2>Trades being taken</h2>
                <p className="stat-value">{trades.filter((t) => t.status === 'open').length || 4}</p>
                <ul className="ticker">
                  {trades.slice(0, 4).map((tr) => (
                    <li key={tr.id}>
                      <span className={`tag ${tr.type === 'Odd' || tr.type === 'Fall' ? 'dn' : 'up'}`}>
                        {tr.type}
                      </span>{' '}
                      {tr.symbolShort} · {tr.stake.toFixed(2)}{' '}
                      <em className={tr.type === 'Odd' || tr.type === 'Fall' ? 'dn' : 'up'}>
                        {tr.status}
                      </em>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="stat stat-pl">
                <h2>Profit / loss</h2>
                <p className={`stat-value ${todayProfit >= 0 ? 'up' : 'dn'}`}>
                  {todayProfit >= 0 ? `+${todayProfit.toFixed(2)}` : todayProfit.toFixed(2)}
                </p>
                <div className="pl-bar">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(10, Math.round((todayWins / Math.max(todayWins + todayLosses, 1)) * 100)))}%`,
                    }}
                  ></i>
                </div>
                <p className="stat-foot">
                  {todayWins} wins · {todayLosses} losses ·{' '}
                  {((todayWins / Math.max(todayWins + todayLosses, 1)) * 100).toFixed(1)}% hit rate today
                </p>
              </article>

              <article className="stat">
                <h2>Runs done</h2>
                <p className="stat-value">
                  {runsDone}
                  <span className="of">/{runsStepper}</span>
                </p>
                <div className="runs">
                  {Array.from({ length: runsStepper }).map((_, i) => (
                    <i key={i} className={i < runsDone ? 'done' : ''}></i>
                  ))}
                </div>
                <p className="stat-foot">
                  Signal recommended: <b>{dynamicSignal.recommendedRuns} runs</b> for this {dynamicSignal.takeValue} setup.
                  {runsStepper - runsDone > 0
                    ? ` (${runsStepper - runsDone} remaining before re-evaluating)`
                    : ' Target completed!'}
                </p>
              </article>
            </div>
          </section>
        )}

        {/* ===================================================================
             2. DIGIT ANALYSIS TOOL
             =================================================================== */}
        {activeTab === 'digits' && (
          <section className="view" style={{ display: 'block' }}>
            <div className="panel">
              <div className="panel-head">
                <h1>Digit analysis</h1>
                <div className="panel-controls">
                  <select
                    className="mmp-select"
                    aria-label="Market"
                    value={selectedMarketName}
                    onChange={(e) => setSelectedMarketName(e.target.value)}
                  >
                    {MARKET_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map((item) => (
                          <option key={item.symbol} value={item.displayName}>
                            {item.displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="segmented" role="group" aria-label="Tick sample size">
                    <button
                      type="button"
                      className={digitSampleSize === 100 ? 'is-active' : ''}
                      onClick={() => setDigitSampleSize(100)}
                    >
                      100
                    </button>
                    <button
                      type="button"
                      className={digitSampleSize === 500 ? 'is-active' : ''}
                      onClick={() => setDigitSampleSize(500)}
                    >
                      500
                    </button>
                    <button
                      type="button"
                      className={digitSampleSize === 1000 ? 'is-active' : ''}
                      onClick={() => setDigitSampleSize(1000)}
                    >
                      1000
                    </button>
                  </div>
                </div>
              </div>

              <div className="quote">
                <div className="quote-price">
                  {quoteSplit.base}
                  <span className="quote-digit">{quoteSplit.lastDigit}</span>
                </div>
                <div className="quote-meta">
                  <span>Last digit stream</span>
                  <span className="quote-stream">
                    {ticks.slice(0, 10).reverse().map((t, idx, arr) => (
                      <i key={idx} className={idx === arr.length - 1 ? 'now' : ''}>
                        {t.lastDigit}
                      </i>
                    ))}
                  </span>
                </div>
              </div>

              {/* DBTraders Style 10-Digit Analysis Circles */}
              <ul className="circles">
                {digitStats.freqs.map((freq, digit) => {
                  const currentLastDigit = ticks[0]?.lastDigit ?? 0;
                  const isCurrent = digit === currentLastDigit;

                  const isRankMost1 = digit === digitStats.firstMost;
                  const isRankMost2 = digit === digitStats.secondMost;
                  const isRankLeast2 = digit === digitStats.secondLeast;
                  const isRankLeast1 = digit === digitStats.firstLeast;

                  let ringClass = 'ring-neutral';
                  if (isRankMost1) {
                    ringClass = 'ring-green';
                  } else if (isRankMost2) {
                    ringClass = 'ring-blue';
                  } else if (isRankLeast2) {
                    ringClass = 'ring-yellow';
                  } else if (isRankLeast1) {
                    ringClass = 'ring-red';
                  }

                  return (
                    <li
                      key={digit}
                      className={isCurrent ? 'is-current-digit' : ''}
                    >
                      <div className={`db-digit-circle ${ringClass}`}>
                        <span className="db-digit-number">{digit}</span>
                        <span className="db-digit-freq">{freq.toFixed(1)}%</span>
                      </div>
                      <div className="digit-cursor-slot">
                        {isCurrent ? (
                          <span
                            className="single-active-cursor"
                            title={`Current last digit in market: ${digit}`}
                            aria-label={`Market last digit cursor pointing to ${digit}`}
                          >
                            <svg
                              width="12"
                              height="8"
                              viewBox="0 0 12 8"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path d="M6 0L12 8H0L6 0Z" fill="#ff6036" />
                            </svg>
                          </span>
                        ) : (
                          <span className="cursor-spacer" aria-hidden="true" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* DBTraders 4 Analysis Cards Grid (OVER/UNDER, MATCH/DIFFER, EVEN/ODD, RISE/FALL) */}
              <div className="db-analysis-grid">
                {/* 1. OVER / UNDER */}
                <div className="db-card">
                  <div className="db-card-header">
                    <span className="db-card-title">OVER / UNDER</span>
                    <span className="db-card-streak">{overUnderStats.streak}</span>
                  </div>

                  <div className="db-digits-row" role="group" aria-label="Select threshold digit for Over/Under">
                    {Array.from({ length: 10 }, (_, d) => (
                      <button
                        key={d}
                        type="button"
                        className={`db-digit-btn ${overUnderThreshold === d ? 'is-selected' : ''}`}
                        onClick={() => setOverUnderThreshold(d)}
                        title={`Set Over/Under threshold to ${d}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  <div className="db-bars-stack">
                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-over">OVER</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-green-grad" style={{ width: `${overUnderStats.overPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{overUnderStats.overPct}%</span>
                    </div>

                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-under">UNDER</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-orange-grad" style={{ width: `${overUnderStats.underPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{overUnderStats.underPct}%</span>
                    </div>
                  </div>

                  <div className="db-chips-row">
                    {overUnderStats.recentChips.map((chip, idx) => (
                      <span key={idx} className={`db-chip ${chip === 'O' ? 'chip-o' : 'chip-u'}`}>
                        {chip}
                      </span>
                    ))}
                    <span className="db-chip-more">+ More</span>
                  </div>
                </div>

                {/* 2. MATCH / DIFFER */}
                <div className="db-card">
                  <div className="db-card-header">
                    <span className="db-card-title">MATCH / DIFFER</span>
                    <span className="db-card-streak">{matchDifferStats.streak}</span>
                  </div>

                  <div className="db-digits-row" role="group" aria-label="Select target digit for Match/Differ">
                    {Array.from({ length: 10 }, (_, d) => (
                      <button
                        key={d}
                        type="button"
                        className={`db-digit-btn ${matchDifferTarget === d ? 'is-selected' : ''}`}
                        onClick={() => setMatchDifferTarget(d)}
                        title={`Set Match/Differ target to ${d}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  <div className="db-bars-stack">
                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-match">MATCH</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-red-grad" style={{ width: `${matchDifferStats.matchPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{matchDifferStats.matchPct}%</span>
                    </div>

                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-differ">DIFFER</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-purple-grad" style={{ width: `${matchDifferStats.differPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{matchDifferStats.differPct}%</span>
                    </div>
                  </div>

                  <div className="db-chips-row">
                    {matchDifferStats.recentChips.map((chip, idx) => (
                      <span key={idx} className={`db-chip ${chip === 'M' ? 'chip-m' : 'chip-d'}`}>
                        {chip}
                      </span>
                    ))}
                    <span className="db-chip-more">+ More</span>
                  </div>
                </div>

                {/* 3. EVEN / ODD */}
                <div className="db-card">
                  <div className="db-card-header">
                    <span className="db-card-title">EVEN / ODD</span>
                    <span className="db-card-streak">{evenOddStats.streak}</span>
                  </div>

                  <div className="db-bars-stack" style={{ marginTop: '12px' }}>
                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-even">EVEN</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-cyan-grad" style={{ width: `${evenOddStats.evenPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{evenOddStats.evenPct}%</span>
                    </div>

                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-odd">ODD</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-red-grad" style={{ width: `${evenOddStats.oddPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{evenOddStats.oddPct}%</span>
                    </div>
                  </div>

                  <div className="db-chips-row">
                    {evenOddStats.recentChips.map((chip, idx) => (
                      <span key={idx} className={`db-chip ${chip === 'E' ? 'chip-e' : 'chip-odd'}`}>
                        {chip}
                      </span>
                    ))}
                    <span className="db-chip-more">+ More</span>
                  </div>
                </div>

                {/* 4. RISE / FALL */}
                <div className="db-card">
                  <div className="db-card-header">
                    <span className="db-card-title">RISE / FALL</span>
                    <span className="db-card-streak">{riseFallStats.streak}</span>
                  </div>

                  <div className="db-bars-stack" style={{ marginTop: '12px' }}>
                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-rise">RISE</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-green-grad" style={{ width: `${riseFallStats.risePct}%` }} />
                      </div>
                      <span className="db-bar-pct">{riseFallStats.risePct}%</span>
                    </div>

                    <div className="db-bar-row">
                      <span className="db-bar-label lbl-fall">FALL</span>
                      <div className="db-progress-track">
                        <div className="db-progress-fill fill-red-grad" style={{ width: `${riseFallStats.fallPct}%` }} />
                      </div>
                      <span className="db-bar-pct">{riseFallStats.fallPct}%</span>
                    </div>
                  </div>

                  <div className="db-chips-row">
                    {riseFallStats.recentChips.map((chip, idx) => (
                      <span key={idx} className={`db-chip ${chip === 'R' ? 'chip-r' : 'chip-f'}`}>
                        {chip}
                      </span>
                    ))}
                    <span className="db-chip-more">+ More</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
             3. CHARTS (Graph Charts Only)
             =================================================================== */}
        {activeTab === 'charts' && (
          <section className="view" style={{ display: 'block' }}>
            <div className="panel">
              <div className="panel-head">
                <h1>Charts</h1>
                <div className="panel-controls">
                  <select
                    className="mmp-select"
                    aria-label="Market"
                    value={selectedMarketName}
                    onChange={(e) => setSelectedMarketName(e.target.value)}
                  >
                    {MARKET_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map((item) => (
                          <option key={item.symbol} value={item.displayName}>
                            {item.displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="segmented" role="group" aria-label="Timeframe">
                    {(['1t', '1m', '5m', '1h'] as const).map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        className={chartTimeframe === tf ? 'is-active' : ''}
                        onClick={() => setChartTimeframe(tf)}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <span className="tv-badge">Graph Chart</span>
                </div>
              </div>

              <div className="chart-slot" id="deriv-chart">
                <canvas ref={canvasRef} className="chart-canvas" />
                <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-none">
                  <span className="font-mono text-sm font-semibold text-text">
                    {activeMarket.displayName}
                  </span>
                  <span className="font-mono text-sm text-rise">
                    {formatQuotePrice(currentQuote, activeMarket.pipSize)}
                  </span>
                  <span className="text-[11px] text-text-3 font-mono">
                    Live Real-time Graph Chart · {ticks.length} ticks buffered
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
             3b. TRADINGVIEW & DERIVED CANDLESTICKS
             =================================================================== */}
        {activeTab === 'tradingview' && (
          <section className="view" style={{ display: 'block' }}>
            <div className="panel">
              <div className="panel-head">
                <div className="flex items-center gap-3">
                  <h1>Market Feeds</h1>
                  <div className="segmented" role="group" aria-label="View feed mode">
                    <button
                      type="button"
                      className={tvViewMode === 'tradingview' ? 'is-active' : ''}
                      onClick={() => setTvViewMode('tradingview')}
                    >
                      <TrendingUp size={13} className="mr-1.5 inline" />
                      TradingView Stream
                    </button>
                    <button
                      type="button"
                      className={tvViewMode === 'deriv-candles' ? 'is-active' : ''}
                      onClick={() => setTvViewMode('deriv-candles')}
                    >
                      <BarChart2 size={13} className="mr-1.5 inline" />
                      Import Deriv Candlesticks
                    </button>
                  </div>
                </div>

                <div className="panel-controls">
                  {tvViewMode === 'tradingview' ? (
                    <>
                      <span className="tv-badge">Live external feed</span>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`, '_blank');
                        }}
                      >
                        Open in TradingView <ExternalLink size={13} className="ml-1 inline" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="tv-badge">Deriv WebSocket Candles</span>
                      <button
                        className="btn btn-primary text-xs py-1.5 px-3"
                        type="button"
                        disabled={isImportingCandles}
                        onClick={handleImportDerivCandles}
                      >
                        <RefreshCw size={13} className={`mr-1.5 inline ${isImportingCandles ? 'animate-spin' : ''}`} />
                        {isImportingCandles ? 'Importing…' : 'Import Live Candles'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {tvViewMode === 'tradingview' ? (
                <>
                  <nav className="tv-bar" aria-label="TradingView markets">
                    <div className="tv-group" role="group" aria-label="Asset class">
                      {(['Forex', 'Crypto', 'Indices', 'Commodities', 'Stocks'] as const).map((cls) => (
                        <button
                          key={cls}
                          type="button"
                          className={tvAssetClass === cls ? 'is-active' : ''}
                          onClick={() => {
                            setTvAssetClass(cls);
                            if (cls === 'Forex') setTvSymbol('FX:EURUSD');
                            if (cls === 'Crypto') setTvSymbol('BINANCE:BTCUSDT');
                            if (cls === 'Indices') setTvSymbol('SP:SPX');
                            if (cls === 'Commodities') setTvSymbol('OANDA:XAUUSD');
                            if (cls === 'Stocks') setTvSymbol('NASDAQ:AAPL');
                          }}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>

                    <div className="tv-symbols" role="group" aria-label="Symbol">
                      <button
                        className={tvSymbol === 'NASDAQ:AAPL' ? 'is-active' : ''}
                        type="button"
                        onClick={() => setTvSymbol('NASDAQ:AAPL')}
                      >
                        AAPL <em className="up">+1.12%</em>
                      </button>
                      <button
                        className={tvSymbol === 'BINANCE:BTCUSDT' ? 'is-active' : ''}
                        type="button"
                        onClick={() => setTvSymbol('BINANCE:BTCUSDT')}
                      >
                        BTC/USDT <em className="dn">−1.24%</em>
                      </button>
                      <button
                        className={tvSymbol === 'FX:EURUSD' ? 'is-active' : ''}
                        type="button"
                        onClick={() => setTvSymbol('FX:EURUSD')}
                      >
                        EUR/USD <em className="up">+0.14%</em>
                      </button>
                      <button
                        className={tvSymbol === 'FX:GBPUSD' ? 'is-active' : ''}
                        type="button"
                        onClick={() => setTvSymbol('FX:GBPUSD')}
                      >
                        GBP/USD <em className="dn">−0.08%</em>
                      </button>
                      <button
                        className={tvSymbol === 'OANDA:XAUUSD' ? 'is-active' : ''}
                        type="button"
                        onClick={() => setTvSymbol('OANDA:XAUUSD')}
                      >
                        XAU/USD <em className="up">+0.62%</em>
                      </button>
                    </div>

                    <div className="tv-tools">
                      <div className="segmented" role="group" aria-label="Interval">
                        {(['1', '5', '15', '60', 'D', 'W', 'M'] as const).map((intv) => (
                          <button
                            key={intv}
                            type="button"
                            className={tvInterval === intv ? 'is-active' : ''}
                            onClick={() => setTvInterval(intv)}
                          >
                            {intv === '60' ? '1h' : intv}
                          </button>
                        ))}
                      </div>
                      <div className="segmented" role="group" aria-label="Chart style">
                        <button
                          className={tvStyle === '1' ? 'is-active' : ''}
                          type="button"
                          onClick={() => setTvStyle('1')}
                        >
                          Candles
                        </button>
                        <button
                          className={tvStyle === '8' ? 'is-active' : ''}
                          type="button"
                          onClick={() => setTvStyle('8')}
                        >
                          Heikin Ashi
                        </button>
                        <button
                          className={tvStyle === '3' ? 'is-active' : ''}
                          type="button"
                          onClick={() => setTvStyle('3')}
                        >
                          Line
                        </button>
                      </div>
                    </div>
                  </nav>

                  {/* TradingView Live Chart Container */}
                  <div className="tv-container" style={{ padding: 0, overflow: 'hidden', minHeight: '620px' }}>
                    <TradingViewLiveChart
                      key={`${tvSymbol}-${tvInterval}-${tvStyle}`}
                      symbol={tvSymbol}
                      interval={tvInterval}
                      style={tvStyle}
                    />
                  </div>

                  <p className="tv-foot">
                    TradingView live streaming chart with real-time indicators, studies (SMA, RSI), drawing tools, and symbol search enabled.
                  </p>
                </>
              ) : (
                <>
                  {/* Derived Markets Candlesticks Streamer & Importer */}
                  <nav className="tv-bar" aria-label="Deriv Candlesticks controls">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-xs font-semibold text-text-3">Market:</label>
                      <select
                        className="mmp-select text-xs py-1"
                        value={derivCandleMarketName}
                        onChange={(e) => setDerivCandleMarketName(e.target.value)}
                      >
                        {MARKET_GROUPS.map((group) => (
                          <optgroup key={group.group} label={group.group}>
                            {group.items.map((item) => (
                              <option key={item.symbol} value={item.displayName}>
                                {item.displayName}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                      <div className="segmented" role="group" aria-label="Candle granularity">
                        {[
                          { label: '1m', sec: 60 },
                          { label: '5m', sec: 300 },
                          { label: '15m', sec: 900 },
                          { label: '1h', sec: 3600 },
                        ].map((g) => (
                          <button
                            key={g.sec}
                            type="button"
                            className={derivCandleGranularity === g.sec ? 'is-active' : ''}
                            onClick={() => setDerivCandleGranularity(g.sec)}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {derivCandles.length > 0 && (
                      <div className="deriv-candle-stats-bar">
                        <div className="stat-pill">
                          <span className="lbl">Open</span>
                          <span className="val">{derivCandles[derivCandles.length - 1]?.open.toFixed(derivCandleMarket.pipSize)}</span>
                        </div>
                        <div className="stat-pill">
                          <span className="lbl">High</span>
                          <span className="val up">{derivCandles[derivCandles.length - 1]?.high.toFixed(derivCandleMarket.pipSize)}</span>
                        </div>
                        <div className="stat-pill">
                          <span className="lbl">Low</span>
                          <span className="val dn">{derivCandles[derivCandles.length - 1]?.low.toFixed(derivCandleMarket.pipSize)}</span>
                        </div>
                        <div className="stat-pill">
                          <span className="lbl">Close</span>
                          <span className="val">{derivCandles[derivCandles.length - 1]?.close.toFixed(derivCandleMarket.pipSize)}</span>
                        </div>
                        <div className="stat-pill">
                          <span className="lbl">Candles</span>
                          <span className="val">{derivCandles.length}</span>
                        </div>
                      </div>
                    )}
                  </nav>

                  <div className="chart-slot" style={{ height: '480px' }} id="deriv-candlestick-slot">
                    <canvas ref={candleCanvasRef} className="chart-canvas" />
                    <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-none">
                      <span className="font-mono text-sm font-semibold text-text">
                        {derivCandleMarket.displayName}
                      </span>
                      <span className="font-mono text-sm text-rise">
                        {derivCandles[derivCandles.length - 1]?.close.toFixed(derivCandleMarket.pipSize)}
                      </span>
                      <span className="text-[11px] text-text-3 font-mono">
                        Imported Deriv Synthetic Japanese Candlesticks ({derivCandles.length} bars)
                      </span>
                    </div>
                  </div>

                  <p className="tv-foot">
                    Streamed directly from Deriv WebSocket via <code>ticks_history</code> with <code>style: candles</code>. Updated in real-time as market ticks occur.
                  </p>
                </>
              )}
            </div>
          </section>
        )}

        {/* ===================================================================
             4. BOTS
             =================================================================== */}
        {activeTab === 'bots' && (
          <section className="view" style={{ display: 'block' }}>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h1>Strategy Bots</h1>
                  <p className="text-xs text-text-3 mt-1">
                    Execute automated Over/Under and digit strategies with custom entry triggers, target digit logic, and compound martingale recovery.
                  </p>
                </div>
                <div className="panel-controls">
                  <span className="hint">
                    {bots.filter((b) => b.running).length} running ·{' '}
                    {bots.filter((b) => !b.running).length} idle
                  </span>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleOpenNewBotModal}
                    title="Configure and create a new strategy bot"
                  >
                    <Plus size={15} />
                    New Strategy Bot
                  </button>
                  {bots.some((b) => b.running) && (
                    <button className="btn btn-danger" type="button" onClick={stopAllBots}>
                      <Square size={14} />
                      Stop all bots
                    </button>
                  )}
                </div>
              </div>

              {/* Bot Category Filter Navigation */}
              <div className="bot-category-bar">
                <button
                  type="button"
                  className={`bot-filter-btn ${botCategoryFilter === 'All' ? 'is-active' : ''}`}
                  onClick={() => setBotCategoryFilter('All')}
                >
                  <Layers size={13} />
                  All Bots ({bots.length})
                </button>
                <button
                  type="button"
                  className={`bot-filter-btn ${botCategoryFilter === 'Deriv Strategies 2' ? 'is-active' : ''}`}
                  onClick={() => setBotCategoryFilter('Deriv Strategies 2')}
                >
                  <Zap size={13} />
                  Deriv Strategies 2 ({bots.filter((b) => b.category === 'Deriv Strategies 2').length})
                </button>
                <button
                  type="button"
                  className={`bot-filter-btn ${botCategoryFilter === 'Indicators' ? 'is-active' : ''}`}
                  onClick={() => setBotCategoryFilter('Indicators')}
                >
                  <Sliders size={13} />
                  Indicators ({bots.filter((b) => b.category === 'Indicators').length})
                </button>
                <button
                  type="button"
                  className={`bot-filter-btn ${botCategoryFilter === 'Running' ? 'is-active' : ''}`}
                  onClick={() => setBotCategoryFilter('Running')}
                >
                  <Play size={13} />
                  Active Running ({bots.filter((b) => b.running).length})
                </button>
              </div>

              <div className="bot-grid">
                {bots
                  .filter((bot) => {
                    if (botCategoryFilter === 'Running') return bot.running;
                    if (botCategoryFilter === 'Deriv Strategies 2') return bot.category === 'Deriv Strategies 2';
                    if (botCategoryFilter === 'Indicators') return bot.category === 'Indicators';
                    return true;
                  })
                  .map((bot) => {
                    const isOver = bot.contractType === 'Over';
                    const isUnder = bot.contractType === 'Under';
                    const targetDig = bot.targetDigit ?? (isUnder ? 7 : isOver ? 1 : 2);

                    return (
                      <article key={bot.id} className={`bot ${bot.running ? 'is-running' : ''}`}>
                        <div className="bot-head">
                          <input
                            type="text"
                            value={bot.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, name: val } : b)));
                            }}
                            aria-label="Name of the bot"
                          />
                          <span className="bot-state">
                            <i></i>
                            {bot.running ? 'Running' : 'Idle'}
                          </span>
                        </div>

                        {/* Badges & Tags */}
                        <div className="bot-tag-row">
                          {bot.category && (
                            <span className="bot-tag bot-tag-cat">
                              {bot.category}
                            </span>
                          )}
                          {(isOver || isUnder) && (
                            <span className={`bot-tag ${isOver ? 'bot-tag-over' : 'bot-tag-under'}`}>
                              {isOver ? '↑' : '↓'} Target: {bot.contractType.toUpperCase()} {targetDig}
                            </span>
                          )}
                          {bot.targetRuns && (
                            <span className="bot-tag bot-tag-runs">
                              {bot.targetRuns} runs target
                            </span>
                          )}
                        </div>

                        {/* Strategy Rules Preview */}
                        {(bot.entryRule || bot.recoveryRule) && (
                          <div className="bot-rules-box">
                            {bot.entryRule && (
                              <div className="bot-rule-line">
                                <span className="bot-rule-label text-live">Entry:</span>
                                <span className="line-clamp-2">{bot.entryRule}</span>
                              </div>
                            )}
                            {bot.recoveryRule && (
                              <div className="bot-rule-line">
                                <span className="bot-rule-label text-fall">Recovery:</span>
                                <span className="line-clamp-2">{bot.recoveryRule}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="bot-fields">
                          <label>
                            Stake ($)
                            <input
                              type="text"
                              className="mmp-input"
                              value={bot.stake}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, stake: val } : b)));
                              }}
                              inputMode="decimal"
                            />
                          </label>
                          <label>
                            Martingale Factor
                            <input
                              type="text"
                              className="mmp-input"
                              value={bot.martingale}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, martingale: val } : b)));
                              }}
                              inputMode="decimal"
                            />
                          </label>
                          <label>
                            Market
                            <select
                              className="mmp-select"
                              value={bot.market}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, market: val } : b)));
                              }}
                            >
                              {MARKET_GROUPS.map((group) => (
                                <optgroup key={group.group} label={group.group}>
                                  {group.items.map((item) => (
                                    <option key={item.symbol} value={item.displayName}>
                                      {item.displayName}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </label>
                          <label>
                            Contract Type
                            <select
                              className="mmp-select"
                              value={bot.contractType}
                              onChange={(e) => {
                                const val = e.target.value as ContractType;
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, contractType: val } : b)));
                              }}
                            >
                              <option>Even</option>
                              <option>Odd</option>
                              <option>Rise</option>
                              <option>Fall</option>
                              <option>Over</option>
                              <option>Under</option>
                              <option>Accumulators</option>
                            </select>
                          </label>

                          {(isOver || isUnder) && (
                            <label>
                              Target Barrier Digit
                              <select
                                className="mmp-select"
                                value={bot.targetDigit ?? (isUnder ? 7 : 1)}
                                onChange={(e) => {
                                  const dig = parseInt(e.target.value, 10);
                                  setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, targetDigit: dig } : b)));
                                }}
                              >
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                                  <option key={d} value={d}>
                                    Digit {d} {isOver ? `(Wins on ${d + 1}-9)` : `(Wins on 0-${d - 1})`}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          <label>
                            Target Runs
                            <input
                              type="number"
                              min="1"
                              max="50"
                              className="mmp-input"
                              value={bot.targetRuns || 5}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, targetRuns: val } : b)));
                              }}
                            />
                          </label>

                          <label>
                            Take Profit ($)
                            <input
                              type="text"
                              className="mmp-input"
                              value={bot.takeProfit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, takeProfit: val } : b)));
                              }}
                              inputMode="decimal"
                            />
                          </label>
                          <label>
                            Stop Loss ($)
                            <input
                              type="text"
                              className="mmp-input"
                              value={bot.stopLoss}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, stopLoss: val } : b)));
                              }}
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        {/* Bot Action Buttons */}
                        <div className="bot-actions-row">
                          <button
                            className="btn btn-run"
                            type="button"
                            onClick={() => toggleBot(bot.id)}
                          >
                            {bot.running ? <Square size={14} /> : <Play size={14} />}
                            {bot.running ? 'Stop Bot' : 'Run Bot'}
                          </button>
                          <button
                            className="btn-bot-sub"
                            type="button"
                            onClick={() => handleOpenEditBot(bot)}
                            title="Configure bot rules and settings"
                          >
                            <Settings size={14} />
                          </button>
                          {bot.strategyId && (
                            <button
                              className="btn-bot-sub"
                              type="button"
                              onClick={() => {
                                setSelectedStrategyId(bot.strategyId as any);
                                setSignalMode('strategies');
                                setActiveTab('dashboard');
                                setBotRunToast(`Switched signal engine to ${bot.name} strategy!`);
                                setTimeout(() => setBotRunToast(null), 3000);
                              }}
                              title="Load strategy into dashboard live signal engine"
                            >
                              <Zap size={14} />
                            </button>
                          )}
                          {bots.length > 1 && (
                            <button
                              className="btn-bot-sub text-fall hover:text-fall"
                              type="button"
                              onClick={() => {
                                setBots((prev) => prev.filter((b) => b.id !== bot.id));
                              }}
                              title="Delete bot"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
             5. RISK MANAGEMENT
             =================================================================== */}
        {activeTab === 'risk' && (
          <section className="view" style={{ display: 'block' }}>
            <div className="panel panel-narrow">
              <div className="panel-head">
                <h1>Risk management</h1>
                <span className="hint">Trading pauses automatically when either limit is reached.</span>
              </div>

              <div className="risk-meter">
                <div className="risk-meter-scale">
                  <span className="dn">Stop loss −{parseFloat(stopLossLimit).toFixed(2)}</span>
                  <span>Break even</span>
                  <span className="up">Target +{parseFloat(targetProfit).toFixed(2)}</span>
                </div>
                <div className="risk-track">
                  <i
                    className="risk-zero"
                    style={{ left: `${zeroPosPct}%` }}
                  ></i>
                  <i
                    className={`risk-fill ${todayProfit < 0 ? 'is-loss' : ''}`}
                    style={{
                      left: todayProfit >= 0 ? `${zeroPosPct}%` : `${currentRiskPct}%`,
                      width: `${Math.abs(currentRiskPct - zeroPosPct)}%`,
                    }}
                  ></i>
                  <i
                    className="risk-now"
                    style={{ left: `${currentRiskPct}%` }}
                  ></i>
                </div>
                <p className="risk-read">
                  Day so far:{' '}
                  <b className={todayProfit >= 0 ? 'up' : 'dn'}>
                    {todayProfit >= 0 ? `+${todayProfit.toFixed(2)}` : todayProfit.toFixed(2)}
                  </b>{' '}
                  —{' '}
                  {targetProfitNum > 0
                    ? `${Math.min(100, ((todayProfit / targetProfitNum) * 100)).toFixed(1)}% of the way to target`
                    : ''}
                  , {(stopLossNum + todayProfit).toFixed(1)} away from the stop.
                </p>
              </div>

              <div className="risk-fields">
                <label className="risk-field">
                  <span className="risk-label">Account balance</span>
                  <span className="risk-input is-locked">
                    <em>{currentCurrency}</em>
                    <input
                      type="text"
                      value={currentBalance.toFixed(2)}
                      readOnly
                      aria-readonly="true"
                    />
                    <span className="risk-note">
                      {isRealAccount ? 'From Deriv Real' : 'Demo virtual'}
                    </span>
                  </span>
                </label>

                <label className="risk-field">
                  <span className="risk-label">Amount to risk</span>
                  <span className="risk-input">
                    <em>{currentCurrency}</em>
                    <input
                      type="text"
                      value={amountToRisk}
                      onChange={(e) => setAmountToRisk(e.target.value)}
                      inputMode="decimal"
                    />
                    <span className="risk-note">
                      {currentBalance > 0
                        ? `${((parseFloat(amountToRisk) / currentBalance) * 100).toFixed(1)}% of balance`
                        : '0% of balance'}
                    </span>
                  </span>
                </label>

                <label className="risk-field">
                  <span className="risk-label">Target profit for the day</span>
                  <span className="risk-input">
                    <em>{currentCurrency}</em>
                    <input
                      type="text"
                      value={targetProfit}
                      onChange={(e) => setTargetProfit(e.target.value)}
                      inputMode="decimal"
                    />
                    <span className="risk-note">Bots stop when hit</span>
                  </span>
                </label>

                <label className="risk-field">
                  <span className="risk-label">Stop loss for the day</span>
                  <span className="risk-input">
                    <em>{currentCurrency}</em>
                    <input
                      type="text"
                      value={stopLossLimit}
                      onChange={(e) => setStopLossLimit(e.target.value)}
                      inputMode="decimal"
                    />
                    <span className="risk-note">Bots stop when hit</span>
                  </span>
                </label>
              </div>

              <div className="risk-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setRiskSavedToast(true);
                    setTimeout(() => setRiskSavedToast(false), 2400);
                  }}
                >
                  {riskSavedToast ? 'Limits saved!' : 'Save limits'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setAmountToRisk('200.00');
                    setTargetProfit('100.00');
                    setStopLossLimit('40.00');
                  }}
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="foot">
        <p>
          Market Mind Pro reads live Deriv market data. Synthetic indices carry risk — set your daily limits before running a bot.
        </p>
      </footer>

      {/* ============ STRATEGY BOT CONFIGURATION MODAL ============ */}
      {botModalOpen && (
        <div className="modal-backdrop" onClick={() => setBotModalOpen(false)}>
          <div className="modal-window max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-accent" />
                <h2 className="text-base font-bold text-text">
                  {editingBot.id ? 'Edit Strategy Bot' : 'Configure Strategy Bot'}
                </h2>
              </div>
              <button
                type="button"
                className="text-text-3 hover:text-text"
                onClick={() => setBotModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 mb-3 rounded bg-[var(--surface-2)] border border-[var(--line)] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text flex items-center gap-1.5">
                  <Zap size={14} className="text-accent" />
                  Strategy Blueprint Preset:
                </span>
                <span className="text-[11px] text-text-3">Auto-fills rules & target digit</span>
              </div>
              <select
                className="mmp-select text-xs py-1.5"
                value={editingBot.strategyId || ''}
                onChange={(e) => applyStrategyPreset(e.target.value)}
              >
                <option value="" disabled>Select strategy template to load rules...</option>
                <optgroup label="Deriv Strategies 2 (Over/Under)">
                  <option value="over-1">Over 1 Strategy (Over 3 Recovery, 90% WR)</option>
                  <option value="over-2">Over 2 Strategy (Over 4 Recovery, 78% WR)</option>
                  <option value="under-8">Under 8 Strategy (Under 6 Recovery, 90% WR)</option>
                  <option value="under-7">Under 7 Strategy (Under 5/6 Recovery, 78% WR)</option>
                  <option value="cmv-pro">CMV Pro (Dynamic Strategy Router & Compound Martingale)</option>
                  <option value="hit-run">Hit & Run (Entry Point 0, 1-2 Runs, Zero Martingale)</option>
                </optgroup>
                <optgroup label="Indicator-Driven Strategies">
                  <option value="strategy-3">Over/Under Strategy 3 (MACD Lines & Green Arc)</option>
                  <option value="strategy-4">Over/Under Strategy 4 (Donchian Breakout & Support Retest)</option>
                  <option value="strategy-5">Over/Under Strategy 5 (Smoothed MA Cross Under 6)</option>
                  <option value="strategy-6">Over/Under Strategy 6 (MA Trend + ADX Over 4/6)</option>
                </optgroup>
              </select>
            </div>

            <div className="modal-field">
              <label className="modal-label">Bot Name</label>
              <input
                type="text"
                className="mmp-input"
                value={editingBot.name}
                onChange={(e) => setEditingBot({ ...editingBot, name: e.target.value })}
                placeholder="e.g. over 1 with over 3 recovery"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="modal-label">Market</label>
                <select
                  className="mmp-select text-xs py-1.5"
                  value={editingBot.market}
                  onChange={(e) => setEditingBot({ ...editingBot, market: e.target.value })}
                >
                  {MARKET_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.items.map((item) => (
                        <option key={item.symbol} value={item.displayName}>
                          {item.displayName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="modal-label">Contract Type</label>
                <select
                  className="mmp-select text-xs py-1.5"
                  value={editingBot.contractType}
                  onChange={(e) => setEditingBot({ ...editingBot, contractType: e.target.value as ContractType })}
                >
                  {(['Over', 'Under', 'Even', 'Odd', 'Rise', 'Fall', 'Matches', 'Differs', 'Accumulators'] as const).map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="modal-label">
                  Target Barrier Digit {editingBot.contractType === 'Over' ? '(Over X)' : editingBot.contractType === 'Under' ? '(Under X)' : ''}
                </label>
                <select
                  className="mmp-select text-xs py-1.5"
                  value={editingBot.targetDigit ?? (editingBot.contractType === 'Under' ? 7 : 1)}
                  onChange={(e) => setEditingBot({ ...editingBot, targetDigit: parseInt(e.target.value, 10) })}
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <option key={d} value={d}>
                      Digit {d} {editingBot.contractType === 'Over' ? `(Wins on ${d + 1}-9 · ${Math.round((9 - d) * 10)}% win rate)` : editingBot.contractType === 'Under' ? `(Wins on 0-${d - 1} · ${Math.round(d * 10)}% win rate)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="modal-label">Category</label>
                <select
                  className="mmp-select text-xs py-1.5"
                  value={editingBot.category || 'Deriv Strategies 2'}
                  onChange={(e) => setEditingBot({ ...editingBot, category: e.target.value as BotCategory })}
                >
                  <option value="Deriv Strategies 2">Deriv Strategies 2</option>
                  <option value="Indicators">Indicators</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="modal-label">Initial Stake ($)</label>
                <input
                  type="text"
                  className="mmp-input"
                  value={editingBot.stake}
                  onChange={(e) => setEditingBot({ ...editingBot, stake: e.target.value })}
                  inputMode="decimal"
                />
              </div>

              <div>
                <label className="modal-label">Martingale Factor</label>
                <input
                  type="text"
                  className="mmp-input"
                  value={editingBot.martingale}
                  onChange={(e) => setEditingBot({ ...editingBot, martingale: e.target.value })}
                  inputMode="decimal"
                />
              </div>

              <div>
                <label className="modal-label">Target Runs</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="mmp-input"
                  value={editingBot.targetRuns}
                  onChange={(e) =>
                    setEditingBot({ ...editingBot, targetRuns: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="modal-label">Take Profit ($)</label>
                <input
                  type="text"
                  className="mmp-input"
                  value={editingBot.takeProfit}
                  onChange={(e) => setEditingBot({ ...editingBot, takeProfit: e.target.value })}
                  inputMode="decimal"
                />
              </div>

              <div>
                <label className="modal-label">Stop Loss ($)</label>
                <input
                  type="text"
                  className="mmp-input"
                  value={editingBot.stopLoss}
                  onChange={(e) => setEditingBot({ ...editingBot, stopLoss: e.target.value })}
                  inputMode="decimal"
                />
              </div>
            </div>

            {/* Strategy Rules Configuration */}
            <div className="space-y-2 mb-4 p-3 rounded bg-[var(--surface-2)] border border-[var(--line)]">
              <div>
                <label className="modal-label text-[11px] font-semibold flex items-center gap-1 text-live">
                  <CheckCircle2 size={13} />
                  Strategy Entry Rule
                </label>
                <textarea
                  className="mmp-input text-xs h-14 resize-none leading-relaxed"
                  value={editingBot.entryRule || ''}
                  onChange={(e) => setEditingBot({ ...editingBot, entryRule: e.target.value })}
                  placeholder="Define entry conditions (e.g. Digits 0 & 1 < 10%, 3+ digits >= 11%, last 20 WR >= 90%)"
                />
              </div>

              <div>
                <label className="modal-label text-[11px] font-semibold flex items-center gap-1 text-fall">
                  <Shield size={13} />
                  Recovery & Martingale Rule
                </label>
                <input
                  type="text"
                  className="mmp-input text-xs"
                  value={editingBot.recoveryRule || ''}
                  onChange={(e) => setEditingBot({ ...editingBot, recoveryRule: e.target.value })}
                  placeholder="e.g. Over 3 Recovery: trade Over 3 with 2.0x Martingale on loss"
                />
              </div>

              <div>
                <label className="modal-label text-[11px] font-semibold flex items-center gap-1 text-text-3">
                  <Sliders size={13} />
                  Exit Rule / Target Protection
                </label>
                <input
                  type="text"
                  className="mmp-input text-xs"
                  value={editingBot.exitRule || ''}
                  onChange={(e) => setEditingBot({ ...editingBot, exitRule: e.target.value })}
                  placeholder="e.g. Take 1-2 runs max then lock profits, stop if streak breaks"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setBotModalOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSaveBotModal(false)}
              >
                Save Bot Configuration
              </button>

              <button
                type="button"
                className="btn btn-primary bg-rise border-rise text-[#03152b] hover:brightness-110 font-bold"
                onClick={() => handleSaveBotModal(true)}
              >
                Save & Run Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ FLOATING AUTH TOAST ============ */}
      {authToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-500/50 bg-[#0c121d]/95 px-4 py-3 text-xs text-emerald-300 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="font-medium">{authToast}</span>
        </div>
      )}

      {/* ============ DERIV LOGIN / OAUTH / ACCOUNT MODAL ============ */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-text shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/30 text-[#ff444f]">
                  <Globe size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">Deriv Account & Balance</h2>
                  <p className="text-[11px] text-text-3">OAuth login and real-time account streaming</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-text-3 hover:bg-[var(--surface-2)] hover:text-text transition-colors"
                onClick={() => setTokenModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Notification */}
            {authError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <span className="font-semibold">Authentication Notice:</span> {authError}
                </div>
                <button
                  type="button"
                  className="text-rose-400 hover:text-rose-200"
                  onClick={() => setAuthError(null)}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Connecting State */}
            {isAuthorizing && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300">
                <RefreshCw size={14} className="animate-spin text-amber-400" />
                <span>Authorizing with Deriv WebSocket server...</span>
              </div>
            )}

            {/* CONNECTED STATE */}
            {(accountProfile || realAccount || virtualAccount) ? (
              <div className="space-y-4">
                {/* Active Account Card */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-mono text-sm font-bold text-emerald-400">
                        {accountProfile?.loginid || realAccount?.loginid || virtualAccount?.loginid}
                      </span>
                    </div>
                    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                      {(accountProfile?.isVirtual ?? isRealAccount === false) ? 'Demo Account' : 'Real Account'}
                    </span>
                  </div>

                  <div className="mb-3">
                    <div className="text-[11px] text-text-3 uppercase tracking-wider font-semibold">Live Balance</div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-2xl font-mono font-black text-rise">
                        {currentCurrency} {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-text-3 hover:text-text underline"
                        onClick={handleRefreshBalance}
                      >
                        <RefreshCw size={12} />
                        Refresh
                      </button>
                    </div>
                  </div>

                  {(accountProfile?.fullname || accountProfile?.email) && (
                    <div className="border-t border-emerald-500/20 pt-2.5 text-xs text-text-3 grid grid-cols-2 gap-2">
                      {accountProfile?.fullname && (
                        <div>
                          <span className="block text-[10px] text-text-3 uppercase">Holder</span>
                          <span className="font-medium text-text">{accountProfile.fullname}</span>
                        </div>
                      )}
                      {accountProfile?.email && (
                        <div>
                          <span className="block text-[10px] text-text-3 uppercase">Email</span>
                          <span className="font-medium text-text truncate block">{accountProfile.email}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Multiple Accounts from OAuth */}
                {oauthAccounts.length > 1 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold text-text-3">Switch Connected Account:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {oauthAccounts.map((acct) => {
                        const isCurrent = (accountProfile?.loginid || activeAccountLogin) === acct.account;
                        return (
                          <button
                            key={acct.account}
                            type="button"
                            className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                              isCurrent
                                ? 'border-live bg-[var(--surface-2)] text-text font-bold'
                                : 'border-[var(--line)] bg-[var(--surface-2)]/50 text-text-2 hover:border-[var(--line-2)] hover:text-text'
                            }`}
                            onClick={() => handleSelectOAuthAccount(acct)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-xs font-bold">{acct.account}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-text-3">
                                {acct.isVirtual ? 'Demo' : 'Real'}
                              </span>
                            </div>
                            <span className="text-[11px] text-text-3">{acct.currency}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between gap-3 border-t border-[var(--line)]">
                  <button
                    type="button"
                    className="btn btn-danger text-xs"
                    onClick={handleLogout}
                  >
                    <LogOut size={14} className="mr-1.5 inline" />
                    Disconnect Account
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      onClick={() => handleOAuthLogin(false)}
                    >
                      <Globe size={13} className="mr-1.5 inline text-[#ff444f]" />
                      Re-login with OAuth
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary text-xs"
                      onClick={() => setTokenModalOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* NOT CONNECTED: OAUTH LOGIN FIRST */
              <div className="space-y-4">
                <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-transparent to-transparent p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff444f]/20 border border-[#ff444f]/40 text-[#ff444f]">
                    <Wallet size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-text mb-1">One-Click Deriv OAuth</h3>
                  <p className="text-xs text-text-2 mb-4 leading-relaxed max-w-sm mx-auto">
                    Log in securely with your Deriv account. Your real/demo balances and account credentials will link automatically without manually creating or copying API tokens.
                  </p>

                  <button
                    type="button"
                    className="w-full py-3 px-4 rounded-xl bg-[#ff444f] hover:bg-[#eb3c46] text-white font-semibold flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-500/25 transition-all transform active:scale-98"
                    onClick={() => handleOAuthLogin(false)}
                  >
                    <Globe size={18} />
                    Log in with Deriv (OAuth)
                  </button>

                  <div className="mt-2.5">
                    <button
                      type="button"
                      className="text-[11px] text-text-3 hover:text-text transition-colors underline"
                      onClick={() => handleOAuthLogin(true)}
                    >
                      Open login in this tab instead of popup
                    </button>
                  </div>
                </div>

                {/* Alternative: Manual API Token Toggle */}
                <div className="border-t border-[var(--line)] pt-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-xs text-text-3 hover:text-text py-1"
                    onClick={() => setManualTokenTab(!manualTokenTab)}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <KeyRound size={14} className="text-live" />
                      Or use Deriv API Token (Alternative)
                    </span>
                    {manualTokenTab ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {manualTokenTab && (
                    <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 space-y-3 animate-in fade-in duration-150">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-text-3">API Token</label>
                          <a
                            href="https://app.deriv.com/account/api-token"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-live hover:underline"
                          >
                            Get token on Deriv
                            <ExternalLink size={11} />
                          </a>
                        </div>
                        <input
                          type="password"
                          className="mmp-input font-mono text-xs"
                          placeholder="Paste token (e.g. a1-xxxxxxxxxxxx)"
                          value={tokenInput}
                          onChange={(e) => setTokenInput(e.target.value)}
                        />
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary w-full text-xs"
                        onClick={handleSaveToken}
                      >
                        Authorize with Token
                      </button>
                    </div>
                  )}
                </div>

                {/* App ID & Callback Settings Toggle */}
                <div className="border-t border-[var(--line)] pt-2">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-[11px] text-text-3 hover:text-text py-1"
                    onClick={() => setShowAppIdSettings(!showAppIdSettings)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Settings size={13} />
                      Deriv App ID & Redirect URL
                    </span>
                    {showAppIdSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {showAppIdSettings && (
                    <div className="mt-2.5 rounded-xl border border-[var(--line)] bg-[var(--ink)] p-3 space-y-3 text-xs text-text-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-text-3 mb-1">
                          Active Deriv App ID
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="mmp-input font-mono text-xs flex-1"
                            value={customAppId}
                            onChange={(e) => setCustomAppId(e.target.value)}
                            placeholder="34rsO15CuRvkoltHhbFgO"
                          />
                          <button
                            type="button"
                            className="btn btn-outline text-xs px-3"
                            onClick={() => handleSaveAppId(customAppId)}
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-text-3">OAuth Redirect URL:</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11px] text-live hover:underline"
                            onClick={handleCopyCallbackUrl}
                          >
                            {copiedCallback ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <Check size={11} /> Copied!
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Copy size={11} /> Copy URL
                              </span>
                            )}
                          </button>
                        </div>
                        <div className="font-mono text-[11px] bg-black/50 p-2 rounded-lg break-all text-text select-all border border-white/5">
                          {typeof window !== 'undefined' ? `${window.location.origin}/callback` : 'https://ais-dev-mlabvk4g66aah7l7fcc6ka-265441201801.europe-west1.run.app/callback'}
                        </div>
                        <p className="mt-1 text-[10px] text-text-3 leading-tight">
                          If registering your custom App on <a href="https://api.deriv.com/dashboard/apps/" target="_blank" rel="noopener noreferrer" className="text-live hover:underline">api.deriv.com</a>, configure this Redirect URL.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--line)]">
                  <div className="flex items-center gap-1.5 text-[11px] text-text-3">
                    <Lock size={12} className="text-emerald-400" />
                    <span>WebSocket TLS encrypted</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => setTokenModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MarketMindApp />
    </QueryClientProvider>
  );
}
