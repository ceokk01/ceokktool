import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import path from "path";
import fs from "fs";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || process.env.DERIV_OAUTH_CLIENT_ID || "34rWXxXfzwQBe8SvHKyId";

const COOKIE_SECRET = process.env.COOKIE_SECRET || "deriv-market-pro-cookie-secret-key-34rWX";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

// In-memory storage for sessions & pending OAuth PKCE requests
interface SessionData {
  accessToken?: string;
  expiresAt?: number;
  clientId?: string;
  [key: string]: any;
}

const sessions = new Map<string, SessionData>();
const pendingOAuthRequests = new Map<string, {
  sessionId: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  createdAt: number;
}>();

function randomId(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function createCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
}

function getSession(req: express.Request, res: express.Response) {
  let sessionId = req.signedCookies.deriv_session;

  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = randomId();
    sessions.set(sessionId, {});

    const isSecure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";

    res.cookie("deriv_session", sessionId, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  return {
    id: sessionId,
    data: sessions.get(sessionId)!,
  };
}

function requireAccessToken(req: express.Request, res: express.Response): SessionData | null {
  const sessionId = req.signedCookies.deriv_session;
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session?.accessToken) {
    res.status(401).json({
      error: "Not authenticated",
      login_url: "/login",
    });

    return null;
  }

  return session;
}

function resolveRedirectUri(req: express.Request): string {
  if (process.env.REDIRECT_URI) return process.env.REDIRECT_URI;
  if (process.env.DERIV_OAUTH_REDIRECT_URI) return process.env.DERIV_OAUTH_REDIRECT_URI;
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http") || "http";
  return `${proto}://${host}/auth/callback`;
}

const symbols = [
  // Continuous volatility
  { symbol: "R_10", displayName: "Volatility 10 Index", category: "Continuous volatility", pipSize: 3 },
  { symbol: "R_25", displayName: "Volatility 25 Index", category: "Continuous volatility", pipSize: 3 },
  { symbol: "R_50", displayName: "Volatility 50 Index", category: "Continuous volatility", pipSize: 4 },
  { symbol: "R_75", displayName: "Volatility 75 Index", category: "Continuous volatility", pipSize: 4 },
  { symbol: "R_100", displayName: "Volatility 100 Index", category: "Continuous volatility", pipSize: 2 },
  // Volatility (1 second)
  { symbol: "1HZ10V", displayName: "Volatility 10 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ15V", displayName: "Volatility 15 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ25V", displayName: "Volatility 25 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ30V", displayName: "Volatility 30 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ50V", displayName: "Volatility 50 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ75V", displayName: "Volatility 75 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ90V", displayName: "Volatility 90 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ100V", displayName: "Volatility 100 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ150V", displayName: "Volatility 150 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  { symbol: "1HZ250V", displayName: "Volatility 250 (1s) Index", category: "Volatility (1 second)", pipSize: 2 },
  // Step indices
  { symbol: "stpRNG", displayName: "Step Index", category: "Step indices", pipSize: 1 },
  { symbol: "stp200RNG", displayName: "Step 200 Index", category: "Step indices", pipSize: 1 },
  { symbol: "stp300RNG", displayName: "Step 300 Index", category: "Step indices", pipSize: 1 },
  { symbol: "stp400RNG", displayName: "Step 400 Index", category: "Step indices", pipSize: 1 },
  { symbol: "stp500RNG", displayName: "Step 500 Index", category: "Step indices", pipSize: 1 },
  // Jump indices
  { symbol: "JD10", displayName: "Jump 10 Index", category: "Jump indices", pipSize: 2 },
  { symbol: "JD25", displayName: "Jump 25 Index", category: "Jump indices", pipSize: 2 },
  { symbol: "JD50", displayName: "Jump 50 Index", category: "Jump indices", pipSize: 2 },
  { symbol: "JD75", displayName: "Jump 75 Index", category: "Jump indices", pipSize: 2 },
  { symbol: "JD100", displayName: "Jump 100 Index", category: "Jump indices", pipSize: 2 },
];

// Health Check Route
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Start Deriv OAuth 2.0 PKCE login
app.get("/login", (req, res) => {
  const session = getSession(req, res);

  const codeVerifier = randomId(64);
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = randomId(32);

  const clientId = (req.query.client_id as string) || DERIV_CLIENT_ID;
  const redirectUri = (req.query.redirect_uri as string) || resolveRedirectUri(req);

  pendingOAuthRequests.set(state, {
    sessionId: session.id,
    codeVerifier,
    redirectUri,
    clientId,
    createdAt: Date.now(),
  });

  const isSecure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
  res.cookie("deriv_oauth_state", state, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: 10 * 60 * 1000,
  });

  const authorizationUrl = new URL("https://auth.deriv.com/oauth2/auth");
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    // The trade scope lets the app access trading accounts.
    scope: "trade account_manage",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  res.redirect(authorizationUrl.toString());
});

// Deriv OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  const sessionId = req.signedCookies.deriv_session;
  const savedState = req.signedCookies.deriv_oauth_state;

  res.clearCookie("deriv_oauth_state");

  if (error) {
    return res.status(400).send(`
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
          <p>${error_description || error}</p>
          <p><a href="/">Return to app</a></p>
        </div>
      </body>
      </html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send("Missing authorization code or state.");
  }

  if (!savedState || savedState !== state) {
    return res.status(400).send("Invalid OAuth state.");
  }

  const pendingRequest = pendingOAuthRequests.get(state as string);
  pendingOAuthRequests.delete(state as string);

  if (
    !pendingRequest ||
    pendingRequest.sessionId !== sessionId ||
    Date.now() - pendingRequest.createdAt > 10 * 60 * 1000
  ) {
    return res.status(400).send("Authorization request expired.");
  }

  try {
    const tokenResponse = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: pendingRequest.clientId,
        code: String(code),
        code_verifier: pendingRequest.codeVerifier,
        redirect_uri: pendingRequest.redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json(tokenData);
    }

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(400).send("Session expired.");
    }

    // Keep the token on the server.
    session.accessToken = tokenData.access_token;
    session.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
    session.clientId = pendingRequest.clientId;

    // Send friendly callback page that notifies window.opener if in popup, or redirects to /
    res.type("html").send(`
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
  } catch (err: any) {
    console.error("Deriv token exchange error:", err);
    res.status(500).send(`Token exchange failed: ${err?.message || "Unknown error"}`);
  }
});

// Return both demo and real accounts
app.get("/api/accounts", async (req, res) => {
  const session = requireAccessToken(req, res);
  if (!session) return;

  const clientId = session.clientId || DERIV_CLIENT_ID;

  try {
    const response = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Deriv-App-ID": clientId,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    console.error("Deriv accounts fetch error:", err);
    res.status(502).json({ error: "Failed to fetch accounts from Deriv", details: err?.message });
  }
});

// Create a one-time WebSocket URL for the selected account
app.post("/api/accounts/:accountId/otp", async (req, res) => {
  const session = requireAccessToken(req, res);
  if (!session) return;

  const clientId = session.clientId || DERIV_CLIENT_ID;
  const accountId = encodeURIComponent(req.params.accountId);

  try {
    const response = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Deriv-App-ID": clientId,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    console.error("Deriv OTP fetch error:", err);
    res.status(502).json({ error: "Failed to create account OTP WebSocket", details: err?.message });
  }
});

// Check current session auth status
app.get("/api/auth/status", (req, res) => {
  const sessionId = req.signedCookies.deriv_session;
  const session = sessionId ? sessions.get(sessionId) : null;

  if (session?.accessToken) {
    res.json({
      authenticated: true,
      expiresAt: session.expiresAt,
      clientId: session.clientId || DERIV_CLIENT_ID,
    });
  } else {
    res.json({
      authenticated: false,
      login_url: "/login",
      clientId: DERIV_CLIENT_ID,
    });
  }
});

// Logout of Deriv account
app.post("/api/auth/logout", (req, res) => {
  const sessionId = req.signedCookies.deriv_session;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie("deriv_session");
  res.clearCookie("deriv_oauth_state");
  res.json({ success: true });
});

app.get("/logout", (req, res) => {
  const sessionId = req.signedCookies.deriv_session;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie("deriv_session");
  res.clearCookie("deriv_oauth_state");
  res.redirect("/");
});

// Deriv Config Route
app.get("/api/deriv/config", (req, res) => {
  const publicAppId = process.env.DERIV_APP_ID ?? "34rsO15CuRvkoltHhbFgO";
  const redirectUri = resolveRedirectUri(req);

  res.json({
    publicAppId,
    clientId: DERIV_CLIENT_ID,
    redirectUri,
    loginUrl: "/login",
    websocketUrl: "wss://api.derivws.com/trading/v1/options/ws/public",
    legacyWebsocketUrl: `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(publicAppId)}`,
  });
});

// Deriv OAuth URL Route
app.get("/api/deriv/oauth-url", (req, res) => {
  const appId = (req.query.app_id as string) || process.env.DERIV_APP_ID || "34rsO15CuRvkoltHhbFgO";
  const url = `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(appId)}&l=en`;
  res.json({ url, appId });
});

// Deriv Market Catalog Route
app.get("/api/deriv/market-catalog", (_req, res) => {
  res.json({ symbols });
});

// Static frontend serving
const candidateDistDirs = [
  path.resolve(process.cwd(), "artifacts/deriv-market-analysis/dist/public"),
  path.resolve(process.cwd(), "artifacts/deriv-market-analysis/dist"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(process.cwd(), "dist"),
];

const distDir = candidateDistDirs.find((d) => fs.existsSync(d)) || candidateDistDirs[0];

app.use(express.static(distDir));

app.get("*", (_req, res) => {
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Not Found");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Deriv Market Analysis server running at http://0.0.0.0:${PORT}`);
});
