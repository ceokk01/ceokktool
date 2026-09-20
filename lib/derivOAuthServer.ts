import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || process.env.DERIV_OAUTH_CLIENT_ID || '34rWXxXfzwQBe8SvHKyId';
export const COOKIE_SECRET = process.env.COOKIE_SECRET || 'deriv-market-pro-secret-cookie-salt-34rWX';

export interface DerivSession {
  id: string;
  accessToken?: string;
  expiresAt?: number;
  clientId?: string;
  activeAccountId?: string;
}

export interface PendingOAuth {
  sessionId: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  createdAt: number;
}

// In-memory sessions & pending OAuth requests
export const sessions = new Map<string, DerivSession>();
export const pendingOAuthRequests = new Map<string, PendingOAuth>();

export function randomId(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function createCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

// Signature helper compatible with cookie-parser signed cookies (s:val.signature)
export function signCookie(value: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '');
  return `s:${value}.${hmac}`;
}

export function unsignCookie(input: string, secret: string): string | false {
  if (!input.startsWith('s:')) return false;
  const match = input.slice(2).match(/^([^.]+)\.(.+)$/);
  if (!match) return false;
  const [, val, sig] = match;
  const expected = crypto.createHmac('sha256', secret).update(val).digest('base64').replace(/=+$/, '');
  return sig === expected ? val : false;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = decodeURIComponent(part.slice(0, idx).trim());
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      cookies[key] = val;
    }
  }
  return cookies;
}

export function getCookie(req: any, name: string): string | undefined {
  if (req.cookies && req.cookies[name]) return req.cookies[name];
  const parsed = parseCookies(req.headers?.cookie);
  return parsed[name];
}

export function getSignedCookie(req: any, name: string): string | undefined {
  if (req.signedCookies && req.signedCookies[name]) {
    return req.signedCookies[name];
  }
  const raw = getCookie(req, name);
  if (!raw) return undefined;
  const unsigned = unsignCookie(raw, COOKIE_SECRET);
  return unsigned !== false ? unsigned : undefined;
}

export function setSignedCookie(res: any, name: string, value: string, options: { maxAge?: number; secure?: boolean } = {}): void {
  const signedVal = signCookie(value, COOKIE_SECRET);
  const maxAge = options.maxAge ?? 24 * 60 * 60 * 1000;
  const isSecure = options.secure ?? (process.env.NODE_ENV === 'production');

  if (typeof res.cookie === 'function') {
    res.cookie(name, value, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecure,
      maxAge,
    });
    return;
  }

  // Fallback for raw Node http ServerResponse
  const expires = new Date(Date.now() + maxAge).toUTCString();
  const secureFlag = isSecure ? '; Secure' : '';
  const cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(signedVal)}; Path=/; Expires=${expires}; Max-Age=${Math.floor(maxAge / 1000)}; HttpOnly; SameSite=Lax${secureFlag}`;

  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), cookieStr]);
  }
}

export function clearCookie(res: any, name: string): void {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie(name, { path: '/' });
    return;
  }
  const cookieStr = `${encodeURIComponent(name)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`;
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), cookieStr]);
  }
}

export function getSession(req: any, res: any): { id: string; data: DerivSession } {
  let sessionId = getSignedCookie(req, 'deriv_session');

  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = randomId();
    sessions.set(sessionId, { id: sessionId });

    const isSecure = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
    setSignedCookie(res, 'deriv_session', sessionId, {
      secure: isSecure,
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  return {
    id: sessionId,
    data: sessions.get(sessionId)!,
  };
}

export function requireAccessToken(req: any, res: any): DerivSession | null {
  const sessionId = getSignedCookie(req, 'deriv_session');
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session?.accessToken) {
    res.status?.(401) || (res.statusCode = 401);
    const body = JSON.stringify({
      error: 'Not authenticated',
      login_url: '/login',
    });
    res.setHeader?.('Content-Type', 'application/json');
    res.end?.(body) || res.json?.(JSON.parse(body));
    return null;
  }

  return session;
}

export function computeRedirectUri(req: any): string {
  if (process.env.REDIRECT_URI) return process.env.REDIRECT_URI;
  if (process.env.DERIV_OAUTH_REDIRECT_URI) return process.env.DERIV_OAUTH_REDIRECT_URI;

  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3000';
  const proto = req.headers?.['x-forwarded-proto'] || (req.connection?.encrypted ? 'https' : 'http') || 'http';
  return `${proto}://${host}/auth/callback`;
}
