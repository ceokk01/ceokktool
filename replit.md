# Deriv Market Analysis

Real-time Deriv market analysis for digit strategies and account-aware contract setup.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `DERIV_APP_ID` — Deriv public app ID (defaults to `1089` for public data)
- Optional env: `DERIV_OAUTH_CLIENT_ID` and `DERIV_OAUTH_REDIRECT_URI` — used only to report OAuth workspace readiness

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/deriv-market-analysis/src/App.tsx` — dashboard, Deriv WebSocket consumers, account token flow, and route shell
- `artifacts/deriv-market-analysis/src/index.css` — dark signal-desk theme and responsive styles
- `artifacts/api-server/src/routes/deriv.ts` — Deriv connection configuration and supported market catalog
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and schemas

## Architecture decisions

- Public ticks use Deriv's current unauthenticated Options WebSocket endpoint; token authorization uses the legacy Deriv WebSocket so account identity and balance subscriptions can be loaded without putting the token in a URL.
- The first build is read-only for trading: strategy selection and accumulator parameters are analysis/setup controls, not order placement.
- Deriv PATs are stored locally in the browser and sent only to Deriv's socket; the API server does not persist or log account tokens.

## Product

- Live synthetic-index quote tape and digit distribution window
- Direction pulse and last-digit analytics
- Strategy selector for over/under, rise/fall, even/odd, higher/lower, only ups, only downs, differs, and accumulators
- Optional Deriv token connection for account identity and live balance subscription
- Connection settings with explicit unavailable states when account auth or OAuth configuration is not present

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The current Deriv public Options socket accepts `R_100` on `wss://api.derivws.com/trading/v1/options/ws/public`; the older `ws.derivws.com/websockets/v3` endpoint is retained only for PAT-based account authorization and balance updates.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
