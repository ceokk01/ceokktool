import express from "express";
import path from "path";
import fs from "fs";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Deriv Config Route
app.get("/api/deriv/config", (_req, res) => {
  const publicAppId = process.env.DERIV_APP_ID ?? "1089";
  res.json({
    publicAppId,
    oauthConfigured: Boolean(
      process.env.DERIV_OAUTH_CLIENT_ID && process.env.DERIV_OAUTH_REDIRECT_URI
    ),
    websocketUrl: "wss://api.derivws.com/trading/v1/options/ws/public",
    legacyWebsocketUrl: `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(publicAppId)}`,
  });
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
