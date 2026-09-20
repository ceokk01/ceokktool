import type { VercelRequest, VercelResponse } from '@vercel/node';

const DERIV_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';

const DERIV_CLIENT_ID =
  process.env.DERIV_OAUTH_CLIENT_ID || '34rWXxXfzwQBe8SvHKyId';

const DERIV_REDIRECT_URI =
  process.env.DERIV_OAUTH_REDIRECT_URI ||
  'https://mydtool.site/callback';

interface DerivTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface DerivAccount {
  loginid?: string;
  login_id?: string;
  account_id?: string;
  id?: string;
  currency?: string;
  currency_code?: string;
  is_virtual?: boolean;
  balance?: number;
}

interface DerivAccountsResponse {
  data?: DerivAccount[];
  accounts?: DerivAccount[];
  message?: string;
  error?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      error_description: 'Only POST requests are allowed.',
    });
  }

  try {
    const {
      code,
      state,
      codeVerifier,
    } = req.body || {};

    if (!code || !state || !codeVerifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description:
          'code, state, and codeVerifier are required.',
      });
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: DERIV_CLIENT_ID,
      code: String(code),
      code_verifier: String(codeVerifier),
      redirect_uri: DERIV_REDIRECT_URI,
    });

    const response = await fetch(DERIV_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = (await response.json()) as DerivTokenResponse;

    if (!response.ok) {
      console.error('Deriv OAuth token exchange failed:', {
        status: response.status,
        error: data.error,
        error_description: data.error_description,
      });

      return res.status(response.status).json({
        error: data.error || 'token_exchange_failed',
        error_description:
          data.error_description ||
          'Deriv rejected the authorization code.',
      });
    }

    const accessToken = data.access_token;

    if (!accessToken) {
      return res.status(502).json({
        error: 'invalid_token_response',
        error_description:
          'Deriv did not return an access token.',
      });
    }

    const accountsResponse = await fetch(
      'https://api.derivws.com/trading/v1/options/accounts',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Deriv-App-ID': DERIV_CLIENT_ID,
          'Content-Type': 'application/json',
        },
      },
    );

    const accountsData =
      (await accountsResponse.json()) as DerivAccountsResponse;

    if (!accountsResponse.ok) {
      console.error(
        'Deriv accounts request failed:',
        accountsData,
      );

      return res.status(accountsResponse.status).json({
        error: 'accounts_request_failed',
        error_description:
          accountsData.message ||
          accountsData.error ||
          'Unable to retrieve Deriv accounts.',
      });
    }

    const rawAccounts = Array.isArray(accountsData.data)
      ? accountsData.data
      : Array.isArray(accountsData.accounts)
        ? accountsData.accounts
        : [];

    const accounts = rawAccounts
      .map((account) => {
        const loginid =
          account.loginid ||
          account.login_id ||
          account.account_id ||
          account.id ||
          '';

        const currency =
          account.currency ||
          account.currency_code ||
          'USD';

        const isVirtual =
          Boolean(account.is_virtual) ||
          String(loginid).startsWith('VR');

        return {
          account: String(loginid),
          token: String(accessToken),
          currency: String(currency),
          isVirtual,
          balance:
            typeof account.balance === 'number'
              ? account.balance
              : undefined,
        };
      })
      .filter((account) => account.account);

    return res.status(200).json({
      access_token: accessToken,
      token_type: data.token_type || 'Bearer',
      expires_in: data.expires_in,
      accounts,
    });
  } catch (error) {
    console.error('OAuth token endpoint error:', error);

    return res.status(500).json({
      error: 'internal_server_error',
      error_description:
        error instanceof Error
          ? error.message
          : 'Unexpected server error.',
    });
  }
}