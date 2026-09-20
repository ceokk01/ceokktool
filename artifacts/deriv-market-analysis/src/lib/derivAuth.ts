export const DEFAULT_DERIV_CLIENT_ID = "34rWXxXfzwQBe8SvHKyId";
export const DEFAULT_DERIV_APP_ID = "34rsO15CuRvkoltHhbFgO";
export const DERIV_REDIRECT_URI = "https://mydtool.site/callback";

export interface DerivOAuthAccount {
  account: string;
  token: string;
  currency: string;
  isVirtual: boolean;
  balance?: number;
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
  TOKEN: "mmp_deriv_token",
  ACCOUNTS: "mmp_deriv_accounts",
  SELECTED_ACCOUNT: "mmp_deriv_selected_acct",
  APP_ID: "mmp_deriv_app_id",
  OAUTH_STATE: "deriv_oauth_state",
  CODE_VERIFIER: "deriv_oauth_code_verifier",
};

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

async function generateCodeChallenge(
  verifier: string,
): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data,
  );

  const bytes = new Uint8Array(digest);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function buildDerivOAuthUrl(
  clientId?: string,
): Promise<string> {
  const finalClientId = (
    clientId || DEFAULT_DERIV_CLIENT_ID
  ).trim();

  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();

  const codeChallenge =
    await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem(
    STORAGE_KEYS.OAUTH_STATE,
    state,
  );

  sessionStorage.setItem(
    STORAGE_KEYS.CODE_VERIFIER,
    codeVerifier,
  );

  const url = new URL(
    "https://auth.deriv.com/oauth2/auth",
  );

  url.searchParams.set(
    "response_type",
    "code",
  );

  url.searchParams.set(
    "client_id",
    finalClientId,
  );

  url.searchParams.set(
    "redirect_uri",
    DERIV_REDIRECT_URI,
  );

  url.searchParams.set(
    "scope",
    "trade",
  );

  url.searchParams.set(
    "state",
    state,
  );

  url.searchParams.set(
    "code_challenge",
    codeChallenge,
  );

  url.searchParams.set(
    "code_challenge_method",
    "S256",
  );

  return url.toString();
}

export function getOAuthState(): string {
  try {
    return (
      sessionStorage.getItem(
        STORAGE_KEYS.OAUTH_STATE,
      ) || ""
    );
  } catch {
    return "";
  }
}

export function getCodeVerifier(): string {
  try {
    return (
      sessionStorage.getItem(
        STORAGE_KEYS.CODE_VERIFIER,
      ) || ""
    );
  } catch {
    return "";
  }
}

export function clearOAuthSession(): void {
  try {
    sessionStorage.removeItem(
      STORAGE_KEYS.OAUTH_STATE,
    );

    sessionStorage.removeItem(
      STORAGE_KEYS.CODE_VERIFIER,
    );
  } catch {
    // Ignore storage errors.
  }
}

export function parseDerivOAuthParams(
  queryOrHash: string,
): DerivOAuthAccount[] {
  if (!queryOrHash) {
    return [];
  }

  let cleanStr = queryOrHash;

  if (
    cleanStr.startsWith("?") ||
    cleanStr.startsWith("#")
  ) {
    cleanStr = cleanStr.substring(1);
  }

  const params = new URLSearchParams(cleanStr);
  const accounts: DerivOAuthAccount[] = [];

  let i = 1;

  while (
    params.has("acct" + i) &&
    params.has("token" + i)
  ) {
    const account =
      (params.get("acct" + i) || "").trim();

    const token =
      (params.get("token" + i) || "").trim();

    const currency =
      (
        params.get("cur" + i) ||
        "USD"
      ).trim();

    const isVirtual =
      account.startsWith("VR") ||
      account.toLowerCase().includes("virtual");

    if (account && token) {
      accounts.push({
        account,
        token,
        currency,
        isVirtual,
      });
    }

    i++;
  }

  if (
    accounts.length === 0 &&
    params.has("token1")
  ) {
    const token =
      (params.get("token1") || "").trim();

    const account =
      (
        params.get("acct1") ||
        "Account"
      ).trim();

    const currency =
      (
        params.get("cur1") ||
        "USD"
      ).trim();

    accounts.push({
      account,
      token,
      currency,
      isVirtual:
        account.startsWith("VR"),
    });
  }

  if (
    accounts.length === 0 &&
    params.has("token")
  ) {
    const token =
      (params.get("token") || "").trim();

    const account =
      (
        params.get("acct") ||
        params.get("account") ||
        "Account"
      ).trim();

    const currency =
      (
        params.get("cur") ||
        "USD"
      ).trim();

    accounts.push({
      account,
      token,
      currency,
      isVirtual:
        account.startsWith("VR"),
    });
  }

  return accounts;
}

export function getStoredAppId(): string {
  try {
    return (
      localStorage.getItem(
        STORAGE_KEYS.APP_ID,
      ) || DEFAULT_DERIV_CLIENT_ID
    );
  } catch {
    return DEFAULT_DERIV_CLIENT_ID;
  }
}

export function saveStoredAppId(
  appId: string,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.APP_ID,
      appId.trim(),
    );
  } catch {
    // Ignore storage issues.
  }
}

export function getStoredAccounts(): DerivOAuthAccount[] {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEYS.ACCOUNTS,
      );

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function saveStoredAccounts(
  accounts: DerivOAuthAccount[],
): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.ACCOUNTS,
      JSON.stringify(accounts),
    );
  } catch {
    // Ignore storage issues.
  }
}

export function getActiveAccountLoginId(): string {
  try {
    return (
      localStorage.getItem(
        STORAGE_KEYS.SELECTED_ACCOUNT,
      ) || ""
    );
  } catch {
    return "";
  }
}

export function setActiveAccountLoginId(
  loginId: string,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.SELECTED_ACCOUNT,
      loginId.trim(),
    );
  } catch {
    // Ignore storage issues.
  }
}

export function getStoredToken(): string {
  try {
    return (
      localStorage.getItem(
        STORAGE_KEYS.TOKEN,
      ) || ""
    );
  } catch {
    return "";
  }
}

export function saveStoredToken(
  token: string,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.TOKEN,
      token.trim(),
    );
  } catch {
    // Ignore storage issues.
  }
}

export function clearDerivAuth(): void {
  try {
    localStorage.removeItem(
      STORAGE_KEYS.TOKEN,
    );

    localStorage.removeItem(
      STORAGE_KEYS.ACCOUNTS,
    );

    localStorage.removeItem(
      STORAGE_KEYS.SELECTED_ACCOUNT,
    );
  } catch {
    // Ignore storage issues.
  }

  clearOAuthSession();
}