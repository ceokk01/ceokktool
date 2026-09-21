import type { VercelRequest, VercelResponse } from '@vercel/node';

const DERIV_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';
const DERIV_CLIENT_ID = process.env.DERIV_OAUTH_CLIENT_ID || '34rWXxXfzwQBe8SvHKyId';
const DERIV_REDIRECT_URI = process.env.DERIV_OAUTH_REDIRECT_URI || 'https://mydtool.site/callback';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      error_description: 'Only POST requests are allowed.',
    });
  }

  try {
    const { code, state, codeVerifier } = req.body || {};

    if (!code || !state || !codeVerifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'code, state, and codeVerifier are required.',
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error || 'token_exchange_failed',
        error_description:
          data?.error_description || 'Deriv rejected the authorization code.',
      });
    }

    const accessToken = data?.access_token;
    if (!accessToken) {
      return res.status(502).json({
        error: 'invalid_token_response',
        error_description: 'Deriv did not return an access token.',
      });
    }

    const accountsResponse = await fetch(
      'https://api.derivws.com/trading/v1/options/accounts',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const accountsData = await accountsResponse.json();

    if (!accountsResponse.ok) {
      return res.status(accountsResponse.status).json({
        error: 'accounts_request_failed',
        error_description:
          accountsData?.message ||
          accountsData?.error ||
          'Unable to retrieve Deriv accounts.',
      });
    }

    const rawAccounts = Array.isArray(accountsData?.data)
      ? accountsData.data
      : Array.isArray(accountsData?.accounts)
        ? accountsData.accounts
        : [];

    const accounts = rawAccounts
      .map((account: any) => {
        const accountId = String(
          account?.account_id ||
            account?.loginid ||
            account?.login_id ||
            account?.id ||
            '',
        );
        const currency = String(
          account?.currency || account?.currency_code || 'USD',
        );
        const accountType = String(account?.account_type || '').toLowerCase();
        const isVirtual = accountType === 'demo' || Boolean(account?.is_virtual);

        return {
          account: accountId,
          token: String(accessToken),
          currency,
          isVirtual,
          accountType: accountType || (isVirtual ? 'demo' : 'real'),
          balance:
            typeof account?.balance === 'number'
              ? account.balance
              : Number(account?.balance ?? 0),
        };
      })
      .filter((account: any) => account.account);

    return res.status(200).json({
      access_token: accessToken,
      token_type: data?.token_type || 'Bearer',
      expires_in: data?.expires_in,
      accounts,
    });
  } catch (error) {
    console.error('OAuth token endpoint error:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      error_description:
        error instanceof Error ? error.message : 'Unexpected server error.',
    });
  }
}
