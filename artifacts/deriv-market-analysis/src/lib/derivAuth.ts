export const DEFAULT_DERIV_CLIENT_ID = '34rWXxXfzwQBe8SvHKyId';
export const DEFAULT_DERIV_APP_ID = '34rsO15CuRvkoltHhbFgO';

export interface DerivTradingAccount {
  account_id?: string;
  accountId?: string;
  id?: string;
  loginid?: string;
  login_id?: string;
  account_type?: string;
  accountType?: string;
  type?: string;
  is_virtual?: boolean;
  currency?: string;
  balance?: number | string;
  available_balance?: number | string;
  amount?: number | string;
  [key: string]: any;
}

export interface DerivOAuthAccount {
  account: string;
  token: string;
  currency: string;
  isVirtual: boolean;
}

export interface DerivAccountProfile {
  loginid: string;
  fullname?: string;
  email?: string;
  currency: string;
  balance: number;
  isVirtual: boolean;
}

const STORAGE_KEYS = {
  TOKEN: 'mmp_deriv_token',
  ACCOUNTS: 'mmp_deriv_accounts',
  SELECTED_ACCOUNT: 'mmp_deriv_selected_acct',
  APP_ID: 'mmp_deriv_app_id',
  CLIENT_ID: 'mmp_deriv_client_id',
};

/**
 * Standard account parsing helpers as defined in the Deriv integration specs
 */
export function getAccountId(account: DerivTradingAccount | any): string {
  if (!account) return '';
  return (
    account.account_id ||
    account.accountId ||
    account.id ||
    account.loginid ||
    account.login_id ||
    account.account ||
    ''
  );
}

export function getAccountLabel(account: DerivTradingAccount | any): string {
  if (!account) return 'Demo';
  return (
    account.account_type ||
    account.accountType ||
    account.type ||
    (account.is_virtual ? 'demo' : 'real')
  );
}

export function isDemoAccount(account: DerivTradingAccount | any): boolean {
  if (!account) return true;
  const label = String(getAccountLabel(account)).toLowerCase();
  const id = String(getAccountId(account) || '').toLowerCase();

  return (
    account.is_virtual === true ||
    label.includes('demo') ||
    label.includes('virtual') ||
    id.startsWith('vrtc') ||
    id.startsWith('vr')
  );
}

export function getBalance(account: DerivTradingAccount | any): string | number {
  if (!account) return '0.00';
  const val =
    account.balance ??
    account.available_balance ??
    account.amount ??
    '0.00';
  return typeof val === 'number' ? val.toFixed(2) : String(val);
}

export function getAccountCurrency(account: DerivTradingAccount | any): string {
  return account?.currency || (isDemoAccount(account) ? 'USD' : 'USD');
}

/**
 * Fetch accounts from the server-side Deriv Options API
 */
export async function fetchDerivAccounts(): Promise<{
  authenticated: boolean;
  accounts: DerivTradingAccount[];
  error?: string;
}> {
  try {
    const response = await fetch('/api/accounts');
    if (response.status === 401) {
      return { authenticated: false, accounts: [] };
    }

    const payload = await response.json();
    if (!response.ok) {
      return {
        authenticated: false,
        accounts: [],
        error: payload.error || payload.message || 'Could not load accounts',
      };
    }

    const rawAccounts = payload.data ?? payload.accounts ?? [];
    const accounts: DerivTradingAccount[] = Array.isArray(rawAccounts)
      ? rawAccounts
      : rawAccounts.accounts || [];

    return { authenticated: true, accounts };
  } catch (err: any) {
    return { authenticated: false, accounts: [], error: err?.message };
  }
}

/**
 * Request an OTP WebSocket connection URL for an authenticated account
 */
export async function requestAccountOtpUrl(accountId: string): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/otp`, {
      method: 'POST',
    });

    const payload = await response.json();
    if (!response.ok) {
      return {
        error: payload.error || payload.message || 'Failed to obtain WebSocket URL',
      };
    }

    const websocketUrl = payload.data?.url || payload.url;
    if (!websocketUrl) {
      return {
        error: 'Deriv did not return a WebSocket URL',
      };
    }

    return { url: websocketUrl };
  } catch (err: any) {
    return { error: err?.message || 'Network error requesting OTP' };
  }
}

/**
 * Check server auth status
 */
export async function checkServerAuthStatus(): Promise<{
  authenticated: boolean;
  clientId?: string;
  expiresAt?: number;
}> {
  try {
    const res = await fetch('/api/auth/status');
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

/**
 * Logout from server Deriv session
 */
export async function logoutServerAuth(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore network error on logout
  }
  clearDerivAuth();
}

/**
 * Parse legacy Deriv OAuth redirect parameters (fallback support)
 */
export function parseDerivOAuthParams(queryOrHash: string): DerivOAuthAccount[] {
  if (!queryOrHash) return [];
  const cleanStr = queryOrHash.startsWith('?') || queryOrHash.startsWith('#')
    ? queryOrHash.slice(1)
    : queryOrHash;
  const params = new URLSearchParams(cleanStr);
  const accounts: DerivOAuthAccount[] = [];

  let i = 1;
  while (params.has(`acct${i}`) && params.has(`token${i}`)) {
    const account = params.get(`acct${i}`)!.trim();
    const token = params.get(`token${i}`)!.trim();
    const currency = (params.get(`cur${i}`) || 'USD').trim();
    const isVirtual = account.startsWith('VR') || account.toLowerCase().includes('virtual');
    if (account && token) {
      accounts.push({ account, token, currency, isVirtual });
    }
    i++;
  }

  if (accounts.length === 0 && params.has('token1')) {
    const token = params.get('token1')!.trim();
    const account = (params.get('acct1') || 'Account').trim();
    const currency = (params.get('cur1') || 'USD').trim();
    accounts.push({
      account,
      token,
      currency,
      isVirtual: account.startsWith('VR'),
    });
  } else if (accounts.length === 0 && params.has('token')) {
    const token = params.get('token')!.trim();
    const account = (params.get('acct') || params.get('account') || 'Account').trim();
    const currency = (params.get('cur') || 'USD').trim();
    accounts.push({
      account,
      token,
      currency,
      isVirtual: account.startsWith('VR'),
    });
  }

  return accounts;
}

/**
 * Storage utilities for client preferences
 */
export function getStoredAppId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.APP_ID) || DEFAULT_DERIV_APP_ID;
  } catch {
    return DEFAULT_DERIV_APP_ID;
  }
}

export function saveStoredAppId(appId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.APP_ID, appId.trim());
  } catch {
    // Ignore storage issues
  }
}

export function getStoredAccounts(): DerivOAuthAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredAccounts(accounts: DerivOAuthAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch {
    // Ignore storage issues
  }
}

export function getActiveAccountLoginId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_ACCOUNT) || '';
  } catch {
    return '';
  }
}

export function setActiveAccountLoginId(loginId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_ACCOUNT, loginId.trim());
  } catch {
    // Ignore storage issues
  }
}

export function getStoredToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  } catch {
    return '';
  }
}

export function saveStoredToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token.trim());
  } catch {
    // Ignore storage issues
  }
}

export function clearDerivAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_ACCOUNT);
  } catch {
    // Ignore storage issues
  }
}

