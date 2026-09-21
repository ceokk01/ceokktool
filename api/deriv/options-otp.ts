import type { VercelRequest, VercelResponse } from '@vercel/node';

const DERIV_OTP_BASE = 'https://api.derivws.com/trading/v1/options/accounts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      error_description: 'Only POST requests are allowed.',
    });
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'A Deriv OAuth bearer token is required.',
    });
  }

  const accountId = String(req.body?.accountId || '').trim();
  if (!accountId) {
    return res.status(400).json({
      error: 'missing_account_id',
      error_description: 'accountId is required.',
    });
  }

  try {
    const response = await fetch(
      `${DERIV_OTP_BASE}/${encodeURIComponent(accountId)}/otp`,
      {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
      },
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Deriv Options OTP request failed:', {
        status: response.status,
        accountId,
        data,
      });

      return res.status(response.status).json({
        error: 'otp_request_failed',
        error_description:
          data?.errors?.[0]?.message ||
          data?.message ||
          data?.error ||
          'Unable to obtain the account WebSocket URL.',
      });
    }

    const websocketUrl = data?.data?.url;

    if (!websocketUrl) {
      return res.status(502).json({
        error: 'missing_websocket_url',
        error_description:
          'Deriv returned a successful response without a WebSocket URL.',
      });
    }

    return res.status(200).json({
      accountId,
      websocketUrl,
    });
  } catch (error) {
    console.error('Deriv Options OTP proxy error:', error);

    return res.status(500).json({
      error: 'internal_server_error',
      error_description:
        error instanceof Error ? error.message : 'Unexpected server error.',
    });
  }
}
