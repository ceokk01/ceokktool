import type { VercelRequest, VercelResponse } from '@vercel/node';

const DERIV_CLIENT_ID =
  process.env.DERIV_OAUTH_CLIENT_ID ||
  process.env.DERIV_CLIENT_ID ||
  '34rWXxXfzwQBe8SvHKyId';

const DERIV_APP_ID =
  process.env.DERIV_APP_ID ||
  '34rsO15CuRvkoltHhbFgO';

const DERIV_REDIRECT_URI =
  process.env.DERIV_OAUTH_REDIRECT_URI ||
  'https://mydtool.site/callback';

export default function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  return res.status(200).json({
    publicAppId: DERIV_APP_ID,
    clientId: DERIV_CLIENT_ID,
    redirectUri: DERIV_REDIRECT_URI,
    loginUrl: '/login',
    websocketUrl:
      'wss://api.derivws.com/trading/v1/options/ws/public',
  });
}