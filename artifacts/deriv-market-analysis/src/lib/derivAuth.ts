export const DEFAULT_DERIV_APP_ID = '34rsO15CuRvkoltHhbFgO';

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
};

/**
 * Parse Deriv OAuth redirect parameters.
 * Deriv returns accounts as query parameters:
 * ?acct1=CR123456&token1=a1-xxxxxx&cur1=USD&acct2=VRTC987654&token2=a1-yyyyyy&cur2=USD
 */
export function parseDerivOAuthParams(queryOrHash: string): DerivOAuthAccount[] {
  if (!queryOrHash) return [];
  const cleanStr = queryOrHash.startsWith('?') || queryOrHash.startsWith('#')
    ? queryOrHash.slice(1)
    : queryOrHash;
  const params = new URLSearchParams(cleanStr);
  const accounts: DerivOAuthAccount[] = [];

  // Parse sequential indexed accounts: acct1, token1, cur1, acct2...
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

  // Fallback check for single account formats
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
 * Build Deriv OAuth login URL
 */
export function buildDerivOAuthUrl(appId?: string): string {
  const finalAppId = (appId || getStoredAppId() || DEFAULT_DERIV_APP_ID).trim();
  return `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(finalAppId)}&l=en`;
}

/**
 * Storage utilities for persistent session
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
