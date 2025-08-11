import express from 'express';
import cors from 'cors';
import { config as appConfig, validateConfig } from './config';
import { SimpleAlertService } from './services/SimpleAlertService';
import { Alert } from './types';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5174;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health endpoint for UI to verify services
app.get('/api/health', async (_req, res) => {
  try {
    validateConfig();
    const service = new SimpleAlertService(appConfig);
    const health = await service.fullHealthCheck();
    res.json({ ok: true, services: health });
  } catch (err: any) {
    res.status(200).json({ ok: false, error: err?.message || 'unknown' });
  }
});

// Process quick alert: alertname (optional) + pod (required) + elasticsearch settings
app.post('/api/quick', async (req, res) => {
  const { alertname, pod, elasticSettings } = req.body || {};
  if (!pod) {
    return res.status(400).json({ error: 'pod is required' });
  }

  // Default elastic settings if not provided
  const settings = {
    timeframeMinutes: elasticSettings?.timeframeMinutes || 60,
    documentLimit: elasticSettings?.documentLimit || 100,
    slowRequestThreshold: elasticSettings?.slowRequestThreshold || 1
  };

  const alert: Alert = {
    status: 'FIRING',
    alertTitle: alertname ? `${alertname} for` : `Log analysis for`,
    alert: alertname ? `Alert triggered for ${alertname}` : `Log analysis for ${pod}`,
    description: alertname ? `Alert ${alertname} triggered on pod ${pod}` : `Log analysis for pod ${pod}`,
    details: {
      alertname: alertname || '',
      pod,
      container: 'unknown',
      ct_cluster: 'unknown',
      namespace: 'default',
      target: 'slack',
      team: 'unknown'
    }
  };

  try {
    validateConfig();
    const service = new SimpleAlertService(appConfig);
    const context = await service.processAlert(alert, settings);
    res.json(context);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to process alert' });
  }
});

// Process full alert JSON
app.post('/api/alert', async (req, res) => {
  const alert = req.body as Alert;
  if (!alert || !alert.details?.alertname) {
    return res.status(400).json({ error: 'Invalid alert payload' });
  }
  try {
    validateConfig();
    const service = new SimpleAlertService(appConfig);
    const context = await service.processAlert(alert);
    res.json(context);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to process alert' });
  }
});

app.listen(PORT, () => {
  console.log(`🟢 API server listening on http://localhost:${PORT}`);
});


