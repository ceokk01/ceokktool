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

function apiPlugin(): Plugin {
  const handleApi = (req: any, res: any, next: any) => {
    const url = req.url?.split('?')[0];
    if (url === '/api/healthz') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url === '/api/deriv/config') {
      const publicAppId = process.env.DERIV_APP_ID ?? '34rsO15CuRvkoltHhbFgO';
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          publicAppId,
          oauthConfigured: Boolean(
            process.env.DERIV_OAUTH_CLIENT_ID &&
              process.env.DERIV_OAUTH_REDIRECT_URI,
          ),
          websocketUrl: 'wss://api.derivws.com/trading/v1/options/ws/public',
          legacyWebsocketUrl: `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(publicAppId)}`,
        }),
      );
      return;
    }
    if (url === '/api/deriv/oauth-url') {
      const parsedUrl = new URL(req.url || '', 'http://localhost');
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
    if (url === '/api/deriv/market-catalog') {
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
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
