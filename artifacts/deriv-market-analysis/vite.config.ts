import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const port = Number(process.env.PORT) || 3000;
const basePath = process.env.BASE_PATH || '/';

const symbols = [
  // Continuous volatility
  { symbol: 'R_10', displayName: 'Volatility 10 Index', category: 'Continuous volatility', pipSize: 3 },
  { symbol: 'R_25', displayName: 'Volatility 25 Index', category: 'Continuous volatility', pipSize: 3 },
  { symbol: 'R_50', displayName: 'Volatility 50 Index', category: 'Continuous volatility', pipSize: 4 },
  { symbol: 'R_75', displayName: 'Volatility 75 Index', category: 'Continuous volatility', pipSize: 4 },
  { symbol: 'R_100', displayName: 'Volatility 100 Index', category: 'Continuous volatility', pipSize: 2 },
  // Volatility (1 second)
  { symbol: '1HZ10V', displayName: 'Volatility 10 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ15V', displayName: 'Volatility 15 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ25V', displayName: 'Volatility 25 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ30V', displayName: 'Volatility 30 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ50V', displayName: 'Volatility 50 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ75V', displayName: 'Volatility 75 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ90V', displayName: 'Volatility 90 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ100V', displayName: 'Volatility 100 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ150V', displayName: 'Volatility 150 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  { symbol: '1HZ250V', displayName: 'Volatility 250 (1s) Index', category: 'Volatility (1 second)', pipSize: 2 },
  // Step indices
  { symbol: 'stpRNG', displayName: 'Step Index', category: 'Step indices', pipSize: 1 },
  { symbol: 'stp200RNG', displayName: 'Step 200 Index', category: 'Step indices', pipSize: 1 },
  { symbol: 'stp300RNG', displayName: 'Step 300 Index', category: 'Step indices', pipSize: 1 },
  { symbol: 'stp400RNG', displayName: 'Step 400 Index', category: 'Step indices', pipSize: 1 },
  { symbol: 'stp500RNG', displayName: 'Step 500 Index', category: 'Step indices', pipSize: 1 },
  // Jump indices
  { symbol: 'JD10', displayName: 'Jump 10 Index', category: 'Jump indices', pipSize: 2 },
  { symbol: 'JD25', displayName: 'Jump 25 Index', category: 'Jump indices', pipSize: 2 },
  { symbol: 'JD50', displayName: 'Jump 50 Index', category: 'Jump indices', pipSize: 2 },
  { symbol: 'JD75', displayName: 'Jump 75 Index', category: 'Jump indices', pipSize: 2 },
  { symbol: 'JD100', displayName: 'Jump 100 Index', category: 'Jump indices', pipSize: 2 },
];

import {
  DERIV_CLIENT_ID,
  randomId,
  createCodeChallenge,
  getSession,
  requireAccessToken,
  computeRedirectUri,
  setSignedCookie,
  clearCookie,
  getSignedCookie,
  sessions,
  pendingOAuthRequests,
} from '../../lib/derivOAuthServer';

function apiPlugin(): Plugin {
  const handleApi = async (req: any, res: any, next: any) => {
    const rawUrl = req.url || '';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/healthz') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Start OAuth login
    if (pathname === '/login') {
      const session = getSession(req, res);
      const codeVerifier = randomId(64);
      const codeChallenge = createCodeChallenge(codeVerifier);
      const state = randomId(32);

      const clientId = parsedUrl.searchParams.get('client_id') || DERIV_CLIENT_ID;
      const redirectUri = parsedUrl.searchParams.get('redirect_uri') || computeRedirectUri(req);

      pendingOAuthRequests.set(state, {
        sessionId: session.id,
        codeVerifier,
        redirectUri,
        clientId,
        createdAt: Date.now(),
      });

      const isSecure = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
      setSignedCookie(res, 'deriv_oauth_state', state, {
        secure: isSecure,
        maxAge: 10 * 60 * 1000,
      });

      const authorizationUrl = new URL('https://auth.deriv.com/oauth2/auth');
      authorizationUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'trade account_manage',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();

      res.writeHead(302, { Location: authorizationUrl.toString() });
      res.end();
      return;
    }

    // OAuth callback
    if (pathname === '/auth/callback') {
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');
      const errorDescription = parsedUrl.searchParams.get('error_description');

      const sessionId = getSignedCookie(req, 'deriv_session');
      const savedState = getSignedCookie(req, 'deriv_oauth_state');

      clearCookie(res, 'deriv_oauth_state');

      if (error) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 400;
        res.end(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>Deriv Login Failed</title>
            <style>
              body { font-family: sans-serif; background: #0c121d; color: #fff; padding: 40px; text-align: center; }
              .box { max-width: 480px; margin: 0 auto; background: #17202a; padding: 24px; border-radius: 12px; }
              a { color: #ff444f; font-weight: bold; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Deriv login failed</h2>
              <p>${errorDescription || error}</p>
              <p><a href="/">Return to app</a></p>
            </div>
          </body>
          </html>
        `);
        return;
      }

      if (!code || !state) {
        res.statusCode = 400;
        res.end('Missing authorization code or state.');
        return;
      }

      if (!savedState || savedState !== state) {
        res.statusCode = 400;
        res.end('Invalid OAuth state.');
        return;
      }

      const pendingRequest = pendingOAuthRequests.get(state);
      pendingOAuthRequests.delete(state);

      if (
        !pendingRequest ||
        pendingRequest.sessionId !== sessionId ||
        Date.now() - pendingRequest.createdAt > 10 * 60 * 1000
      ) {
        res.statusCode = 400;
        res.end('Authorization request expired.');
        return;
      }

      try {
        const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: pendingRequest.clientId,
            code,
            code_verifier: pendingRequest.codeVerifier,
            redirect_uri: pendingRequest.redirectUri,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          res.statusCode = tokenResponse.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(tokenData));
          return;
        }

        const session = sessions.get(sessionId || '');
        if (!session) {
          res.statusCode = 400;
          res.end('Session expired.');
          return;
        }

        session.accessToken = tokenData.access_token;
        session.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
        session.clientId = pendingRequest.clientId;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>Deriv Authentication Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0c121d;
                color: #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }
              .card {
                background: #131d2e;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 12px;
                padding: 28px 36px;
                text-align: center;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
              }
              .badge {
                display: inline-block;
                background: rgba(34, 197, 94, 0.15);
                color: #4ade80;
                border: 1px solid rgba(34, 197, 94, 0.3);
                border-radius: 999px;
                padding: 4px 12px;
                font-size: 12px;
                font-weight: 600;
                margin-bottom: 12px;
              }
              h2 { margin: 0 0 8px; font-size: 18px; }
              p { margin: 0; font-size: 13px; color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">✓ Authenticated</div>
              <h2>Connected with Deriv</h2>
              <p>Synchronizing your trading accounts...</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'DERIV_AUTH_PKCE_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 500);
                } else {
                  window.location.href = '/?auth=success';
                }
              } catch (e) {
                window.location.href = '/?auth=success';
              }
            </script>
          </body>
          </html>
        `);
        return;
      } catch (err: any) {
        res.statusCode = 500;
        res.end(`Token exchange error: ${err?.message || 'Unknown error'}`);
        return;
      }
    }

    // Return accounts
    if (pathname === '/api/accounts') {
      const session = requireAccessToken(req, res);
      if (!session) return;

      const clientId = session.clientId || DERIV_CLIENT_ID;

      try {
        const response = await fetch(
          'https://api.derivws.com/trading/v1/options/accounts',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'Deriv-App-ID': clientId,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();
        res.statusCode = response.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (err: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Failed to fetch accounts from Deriv', details: err?.message }));
      }
      return;
    }

    // Create a one-time WebSocket URL for the selected account
    if (pathname.startsWith('/api/accounts/') && pathname.endsWith('/otp')) {
      const session = requireAccessToken(req, res);
      if (!session) return;

      const clientId = session.clientId || DERIV_CLIENT_ID;
      const accountId = pathname.slice('/api/accounts/'.length, pathname.length - '/otp'.length);

      try {
        const response = await fetch(
          `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'Deriv-App-ID': clientId,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();
        res.statusCode = response.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (err: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Failed to create OTP WebSocket', details: err?.message }));
      }
      return;
    }

    // Auth status
    if (pathname === '/api/auth/status' || pathname === '/api/auth/session') {
      const sessionId = getSignedCookie(req, 'deriv_session');
      const session = sessionId ? sessions.get(sessionId) : null;

      res.setHeader('Content-Type', 'application/json');
      if (session?.accessToken) {
        res.end(JSON.stringify({
          authenticated: true,
          expiresAt: session.expiresAt,
          clientId: session.clientId || DERIV_CLIENT_ID,
        }));
      } else {
        res.end(JSON.stringify({
          authenticated: false,
          login_url: '/login',
          clientId: DERIV_CLIENT_ID,
        }));
      }
      return;
    }

    // Logout
    if (pathname === '/api/auth/logout' || pathname === '/logout') {
      const sessionId = getSignedCookie(req, 'deriv_session');
      if (sessionId) {
        sessions.delete(sessionId);
      }
      clearCookie(res, 'deriv_session');
      clearCookie(res, 'deriv_oauth_state');

      if (pathname === '/logout') {
        res.writeHead(302, { Location: '/' });
        res.end();
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      }
      return;
    }

    if (pathname === '/api/deriv/config') {
      const publicAppId = process.env.DERIV_APP_ID ?? '34rsO15CuRvkoltHhbFgO';
      const redirectUri = computeRedirectUri(req);

      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          publicAppId,
          clientId: DERIV_CLIENT_ID,
          redirectUri,
          loginUrl: '/login',
          websocketUrl: 'wss://api.derivws.com/trading/v1/options/ws/public',
          legacyWebsocketUrl: `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(publicAppId)}`,
        }),
      );
      return;
    }
    if (pathname === '/api/deriv/oauth-url') {
      const appId = parsedUrl.searchParams.get('app_id') || process.env.DERIV_APP_ID || '34rsO15CuRvkoltHhbFgO';
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          url: `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(appId)}&l=en`,
          appId,
        }),
      );
      return;
    }
    if (pathname === '/api/deriv/market-catalog') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ symbols }));
      return;
    }
    next();
  };

  return {
    name: 'deriv-api-plugin',
    configureServer(server) {
      server.middlewares.use(handleApi);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApi);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    apiPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      allow: [path.resolve(import.meta.dirname, '..', '..')],
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
