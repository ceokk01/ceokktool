---
name: Deriv WebSocket auth split
description: Current Deriv API separates public market streaming from token-authenticated account sockets.
---

Public Options market data uses the current `api.derivws.com` WebSocket endpoint, while the legacy `ws.derivws.com/websockets/v3` socket remains useful for direct PAT authorization and balance subscriptions in browser tools.

**Why:** The current public endpoint accepts synthetic-index symbols such as `R_100`; the legacy endpoint can open but rejects those symbols, so using one socket for both creates a misleading connected-but-empty market view.

**How to apply:** Keep public ticks and account authorization as separate socket concerns until the app has a server-side OAuth/PAT-to-OTP flow for the current authenticated Options WebSocket.