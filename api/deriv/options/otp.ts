import type { VercelRequest, VercelResponse } from '@vercel/node';

interface DerivOtpResponse {
  data?: {
    url?: string;
    otp?: string;
  };
  errors?: Array<{
    status?: number;
    code?: string;
    message?: string;
  }>;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const accountId = String(req.body?.accountId || '').trim();
  const token = String(req.body?.token || '').trim();

  if (!accountId) {
    return res.status(400).json({
      error: 'Missing accountId',
    });
  }

  if (!token) {
    return res.status(401).json({
      error: 'Missing access token',
    });
  }

  try {
    const response = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const data = (await response.json()) as DerivOtpResponse;

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data.errors?.[0]?.message ||
          'Failed to obtain Deriv WebSocket OTP',
        code: data.errors?.[0]?.code,
        details: data.errors,
      });
    }

    if (!data.data?.url) {
      return res.status(502).json({
        error: 'Deriv did not return an authenticated WebSocket URL',
      });
    }

    return res.status(200).json({
      url: data.data.url,
    });
  } catch (error) {
    console.error('Deriv OTP request failed:', error);

    return res.status(500).json({
      error: 'Failed to connect to Deriv',
    });
  }
}