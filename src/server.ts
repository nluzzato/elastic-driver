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

// Request flow analysis and contextual debugging
app.post('/api/request-trace', async (req, res) => {
  const { requestId } = req.body || {};
  if (!requestId) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  try {
    validateConfig();
    const service = new SimpleAlertService(appConfig);
    
    // Get all documents for the request ID
    const documents = await service.getRequestTrace(requestId);
    
    if (documents.length === 0) {
      return res.json({ 
        requestId,
        documents: [],
        message: 'No documents found for this request ID'
      });
    }

    res.json({
      requestId,
      documents,
      documentCount: documents.length,
      timeRange: {
        start: documents[0]?.['@timestamp'],
        end: documents[documents.length - 1]?.['@timestamp']
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch request trace' });
  }
});

// Generate contextual debugging prompt
app.post('/api/generate-debug-prompt', async (req, res) => {
  const { requestId, documents, customPrompt } = req.body || {};
  if (!requestId || !documents) {
    return res.status(400).json({ error: 'requestId and documents are required' });
  }

  try {
    validateConfig();
    const service = new SimpleAlertService(appConfig);
    
    // Generate contextual debugging prompt using o3-mini
    const debugPrompt = await service.generateDebugPrompt(requestId, documents, customPrompt);

    res.json({
      requestId,
      debugPrompt,
      documentCount: documents.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to generate debug prompt' });
  }
});

app.listen(PORT, () => {
  console.log(`🟢 API server listening on http://localhost:${PORT}`);
});


