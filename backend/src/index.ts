import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import ledgerRoutes from './routes/ledger';
import voiceRoutes from './routes/voice';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// Health Check Route (/api/v1/health)
// ============================================================================
app.get('/api/v1/health', (_req, res) => {
  res.json({
    app: 'FinTrack Backend API v1',
    status: 'OK',
    port: env.PORT,
    theme: {
      backgroundCream: '#FAF6F0',
      surfaceBeige: '#F3ECE1',
      personalModeBrown: '#6F4E37',
      businessModeMahogany: '#3E2723',
    },
  });
});

// Mount v1 API routes
app.use('/api/v1', ledgerRoutes);
app.use('/api/v1', voiceRoutes);

if (require.main === module) {
  app.listen(env.PORT, () => {
    console.log(`☕ FinTrack Backend API v1 running on http://localhost:${env.PORT}/api/v1`);
  });
}

export default app;
