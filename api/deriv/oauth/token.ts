import type { VercelRequest, VercelResponse } from '@vercel/node';

const DERIV_CLIENT_ID =
  process.env.DERIV_OAUTH_CLIENT_ID ||
  process.env.DERIV_CLIENT_ID ||
  '34rWXxXfzwQBe8SvHKyId';

const DERIV_REDIRECT_URI =
  process.env.DERIV_OAUTH_REDIRECT_URI ||
  'https://mydtool.site/callback';

const DERIV_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts';
const DERIV_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';

type RawAccount = {
  account_id?: string;
  loginid?: string;
  login_id?: string;
  id?: string;
  balance?: number | string;
  currency?: string;
  currency_code?: string;
  account_type?: string;
  is_virtual?: boolean;
};

interface DerivAccountsPayload {
  message?: string;
  error?: string;
  errors?: Array<{ message?: string; code?: string }>;
  data?: RawAccount[];
  accounts?: RawAccount[];
}

interface DerivTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

// Helper to parse classic Deriv OAuth query params (acct1, token1, cur1, ...)
function parseAccountsFromQuery(query: Record<string, unknown>) {
  const accounts: Array<{
    account: string;
    token: string;
    currency: string;
    isVirtual: boolean;
    balance: number;
    accountType: string;
  }> = [];

  let i = 1;
  while (query[`acct${i}`] && query[`token${i}`]) {
    const account = String(query[`acct${i}`] || '').trim();
    const token = String(query[`token${i}`] || '').trim();
    const currency = String(query[`cur${i}`] || 'USD').trim();
    const isVirtual = account.startsWith('VR') || account.toLowerCase().includes('virtual');

    if (account && token) {
      accounts.push({
        account,
        token,
        currency,
        isVirtual,
        balance: 0,
        accountType: isVirtual ? 'demo' : 'real',
      });
    }
    i++;
  }

  if (accounts.length === 0 && query.token1) {
    const token = String(query.token1 || '').trim();
    const account = String(query.acct1 || 'Account').trim();
    const currency = String(query.cur1 || 'USD').trim();
    const isVirtual = account.startsWith('VR');

    accounts.push({
      account,
      token,
      currency,
      isVirtual,
      balance: 0,
      accountType: isVirtual ? 'demo' : 'real',
    });
  }

  return accounts;
}

// Helper to fetch options accounts using a bearer token
async function fetchDerivAccounts(bearerToken: string) {
  const authHeader = bearerToken.toLowerCase().startsWith('bearer ')
    ? bearerToken
    : `Bearer ${bearerToken}`;

  const response = await fetch(DERIV_ACCOUNTS_URL, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as DerivAccountsPayload;

  if (!response.ok) {
    return {
      success: false as const,
      status: response.status,
      error:
        data?.message ||
        data?.error ||
        data?.errors?.[0]?.message ||
        'Unable to retrieve Deriv accounts.',
      accounts: [],
    };
  }

  const rawAccounts: RawAccount[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.accounts)
      ? data.accounts
      : [];

  const rawToken = bearerToken.toLowerCase().startsWith('bearer ')
    ? bearerToken.slice(7).trim()
    : bearerToken.trim();

  const accounts = rawAccounts
    .map((account) => {
      const accountId = String(
        account.account_id ||
          account.loginid ||
          account.login_id ||
          account.id ||
          '',
      );
      const accountType = String(account.account_type || '').toLowerCase();
      const isVirtual =
        accountType === 'demo' ||
        Boolean(account.is_virtual) ||
        accountId.startsWith('VR');

      return {
        account: accountId,
        token: rawToken,
        currency: String(account.currency || account.currency_code || 'USD'),
        accountType: accountType || (isVirtual ? 'demo' : 'real'),
        isVirtual,
        balance: Number(account.balance ?? 0),
      };
    })
    .filter((a) => a.account);

  return {
    success: true as const,
    status: 200,
    accounts,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS for local dev and preview deployments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests (Deriv callback redirect or direct query)
  if (req.method === 'GET') {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

    if (error) {
      return res.status(400).json({
        error: 'authorization_failed',
        error_description: error_description || error,
      });
    }

    // 1. Classic Deriv OAuth query redirect (acct1, token1, ...)
    const classicAccounts = parseAccountsFromQuery(req.query as Record<string, unknown>);
    if (classicAccounts.length > 0) {
      const acceptsHtml = req.headers.accept?.includes('text/html');
      if (acceptsHtml) {
        // Redirect browser to root with the params preserved
        const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
        return res.redirect(`/?${queryString}`);
      }
      return res.status(200).json({ accounts: classicAccounts });
    }

    // 2. Authorization code in GET query (e.g. Deriv callback with code & state)
    if (code) {
      const codeVerifier =
        (req.query.code_verifier as string) ||
        (req.query.codeVerifier as string) ||
        '';

      const clientId =
        (req.query.client_id as string) ||
        (req.query.clientId as string) ||
        DERIV_CLIENT_ID;

      const redirectUri =
        (req.query.redirect_uri as string) ||
        (req.query.redirectUri as string) ||
        DERIV_REDIRECT_URI;

      try {
        const tokenResponse = await fetch(DERIV_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: String(code),
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
          }),
        });

        const tokenData = (await tokenResponse.json().catch(() => ({}))) as DerivTokenResponse;

        if (!tokenResponse.ok || !tokenData.access_token) {
          return res.status(tokenResponse.status || 400).json({
            error: tokenData.error || 'token_exchange_failed',
            error_description:
              tokenData.error_description ||
              tokenData.message ||
              'Deriv token exchange failed.',
          });
        }

        const accountsResult = await fetchDerivAccounts(tokenData.access_token);
        const accounts =
          accountsResult.accounts.length > 0
            ? accountsResult.accounts
            : [
                {
                  account: 'Deriv Account',
                  token: tokenData.access_token,
                  currency: 'USD',
                  accountType: 'real',
                  isVirtual: false,
                  balance: 0,
                },
              ];

        const acceptsHtml = req.headers.accept?.includes('text/html');
        if (acceptsHtml) {
          return res.redirect(`/?token=${encodeURIComponent(tokenData.access_token)}&auth=success`);
        }

        return res.status(200).json({
          access_token: tokenData.access_token,
          accounts,
        });
      } catch (err) {
        console.error('Deriv GET OAuth token exchange error:', err);
        return res.status(500).json({
          error: 'server_error',
          error_description: err instanceof Error ? err.message : 'Token exchange failed',
        });
      }
    }

    // 3. Authorization Bearer token header or token query
    const authHeader = req.headers.authorization;
    const queryToken = (req.query.token as string) || (req.query.access_token as string);

    if (authHeader || queryToken) {
      const token = queryToken || (authHeader ? authHeader.replace(/^bearer\s+/i, '') : '');
      const result = await fetchDerivAccounts(token);
      if (!result.success) {
        return res.status(result.status).json({
          error: 'accounts_request_failed',
          error_description: result.error,
        });
      }
      return res.status(200).json({ accounts: result.accounts });
    }

    return res.status(400).json({
      error: 'invalid_request',
      error_description:
        'Deriv callback requires code or authorization token parameters.',
    });
  }

  // Handle POST requests (Frontend client code exchange or direct token verification)
  if (req.method === 'POST') {
    const body = (req.body || {}) as {
      code?: string;
      state?: string;
      codeVerifier?: string;
      code_verifier?: string;
      clientId?: string;
      client_id?: string;
      redirectUri?: string;
      redirect_uri?: string;
      token?: string;
      accessToken?: string;
    };

    const code = body.code;
    const codeVerifier = body.codeVerifier || body.code_verifier || '';
    const clientId = body.clientId || body.client_id || DERIV_CLIENT_ID;
    const redirectUri = body.redirectUri || body.redirect_uri || DERIV_REDIRECT_URI;

    // Direct token provided
    const directToken = body.token || body.accessToken;
    if (!code && directToken) {
      const result = await fetchDerivAccounts(directToken);
      if (!result.success) {
        return res.status(result.status).json({
          error: 'accounts_request_failed',
          error_description: result.error,
        });
      }
      return res.status(200).json({ accounts: result.accounts });
    }

    if (!code) {
      return res.status(400).json({
        error: 'missing_code',
        error_description: 'Authorization code is required for token exchange.',
      });
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: String(code),
        redirect_uri: redirectUri,
      });

      if (codeVerifier) {
        params.set('code_verifier', codeVerifier);
      }

      const tokenResponse = await fetch(DERIV_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      const tokenData = (await tokenResponse.json().catch(() => ({}))) as DerivTokenResponse;

      if (!tokenResponse.ok || !tokenData.access_token) {
        return res.status(tokenResponse.status || 400).json({
          error: tokenData.error || 'token_exchange_failed',
          error_description:
            tokenData.error_description ||
            tokenData.message ||
            'Deriv OAuth token exchange failed.',
        });
      }

      const accountsResult = await fetchDerivAccounts(tokenData.access_token);
      const accounts =
        accountsResult.accounts.length > 0
          ? accountsResult.accounts
          : [
              {
                account: 'Deriv Account',
                token: tokenData.access_token,
                currency: 'USD',
                accountType: 'real',
                isVirtual: false,
                balance: 0,
              },
            ];

      return res.status(200).json({
        access_token: tokenData.access_token,
        accounts,
      });
    } catch (err) {
      console.error('Deriv POST OAuth token exchange error:', err);
      return res.status(500).json({
        error: 'server_error',
        error_description: err instanceof Error ? err.message : 'Unexpected server error.',
      });
    }
  }

  return res.status(405).json({
    error: 'method_not_allowed',
    error_description: 'Only GET and POST requests are supported.',
  });
}
