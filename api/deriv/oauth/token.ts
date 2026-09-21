import type { VercelRequest, VercelResponse } from '@vercel/node';

const DERIV_ACCOUNTS_URL = 'https://api.derivws.com/trading/v1/options/accounts';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'method_not_allowed',
      error_description: 'Only GET requests are allowed.',
    });
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'A Deriv OAuth bearer token is required.',
    });
  }

  try {
    const response = await fetch(DERIV_ACCOUNTS_URL, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'accounts_request_failed',
        error_description:
          data?.message ||
          data?.error ||
          data?.errors?.[0]?.message ||
          'Unable to retrieve Deriv accounts.',
      });
    }

    const rawAccounts: RawAccount[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.accounts)
        ? data.accounts
        : [];

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
        const isVirtual = accountType === 'demo' || Boolean(account.is_virtual);

        return {
          account: accountId,
          currency: String(account.currency || account.currency_code || 'USD'),
          accountType: accountType || (isVirtual ? 'demo' : 'real'),
          isVirtual,
          balance: Number(account.balance ?? 0),
        };
      })
      .filter((account) => account.account);

    return res.status(200).json({ accounts });
  } catch (error) {
    console.error('Deriv accounts proxy error:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      error_description:
        error instanceof Error ? error.message : 'Unexpected server error.',
    });
  }
}
