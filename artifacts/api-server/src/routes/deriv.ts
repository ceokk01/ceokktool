import { Router, type IRouter } from "express";
import {
  GetDerivConfigResponse,
  GetDerivMarketCatalogResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const symbols = [
  { symbol: "1HZ10V", displayName: "Volatility 10 (1s)", category: "Volatility", pipSize: 2 },
  { symbol: "1HZ25V", displayName: "Volatility 25 (1s)", category: "Volatility", pipSize: 2 },
  { symbol: "1HZ50V", displayName: "Volatility 50 (1s)", category: "Volatility", pipSize: 2 },
  { symbol: "1HZ75V", displayName: "Volatility 75 (1s)", category: "Volatility", pipSize: 2 },
  { symbol: "1HZ100V", displayName: "Volatility 100 (1s)", category: "Volatility", pipSize: 2 },
  { symbol: "R_10", displayName: "Volatility 10", category: "Volatility", pipSize: 3 },
  { symbol: "R_25", displayName: "Volatility 25", category: "Volatility", pipSize: 3 },
  { symbol: "R_50", displayName: "Volatility 50", category: "Volatility", pipSize: 4 },
  { symbol: "R_75", displayName: "Volatility 75", category: "Volatility", pipSize: 4 },
  { symbol: "R_100", displayName: "Volatility 100", category: "Volatility", pipSize: 2 },
];

router.get("/deriv/config", (_req, res) => {
  const publicAppId = process.env.DERIV_APP_ID ?? "34rsO15CuRvkoltHhbFgO";
  const data = GetDerivConfigResponse.parse({
    publicAppId,
    oauthConfigured: Boolean(
      process.env.DERIV_OAUTH_CLIENT_ID && process.env.DERIV_OAUTH_REDIRECT_URI,
    ),
    websocketUrl: "wss://api.derivws.com/trading/v1/options/ws/public",
    legacyWebsocketUrl: `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(publicAppId)}`,
  });
  res.json(data);
});

router.get("/deriv/market-catalog", (_req, res) => {
  const data = GetDerivMarketCatalogResponse.parse({ symbols });
  res.json(data);
});

export default router;