import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SUBMISSIONS_FILE = path.resolve(process.cwd(), 'submissions.json');

app.use(express.json());

// Helper to get submissions from storage
function getSubmissions(): any[] {
  try {
    if (!fs.existsSync(SUBMISSIONS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading submissions file:', err);
    return [];
  }
}

// Helper to save submissions to storage
function saveSubmissions(subs: any[]): void {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving submissions file:', err);
  }
}

// 1. Submit form endpoint
app.post('/api/submit', (req, res) => {
  const { answers } = req.body;
  if (!answers) {
    return res.status(400).json({ success: false, error: 'Respostas não enviadas' });
  }

  const submissions = getSubmissions();
  const nextId = submissions.length > 0 ? Math.max(...submissions.map((s: any) => Number(s.id) || 0)) + 1 : 101;
  const newSubmission = {
    id: nextId,
    data: answers,
    created_at: new Date().toISOString()
  };

  submissions.unshift(newSubmission);
  saveSubmissions(submissions);

  console.log(`[Lead Recebido] #${newSubmission.id} gravado com sucesso.`);
  return res.json({ success: true, id: newSubmission.id });
});

// Favicon and icon static routes
app.get('/favicon.ico', (_req, res) => {
  if (fs.existsSync(path.resolve(process.cwd(), 'favicon.ico'))) {
    return res.sendFile(path.resolve(process.cwd(), 'favicon.ico'));
  }
  return res.sendFile(path.resolve(process.cwd(), 'site-icon.svg'));
});

app.get('/favicon.png', (_req, res) => {
  if (fs.existsSync(path.resolve(process.cwd(), 'favicon.png'))) {
    return res.sendFile(path.resolve(process.cwd(), 'favicon.png'));
  }
  return res.sendFile(path.resolve(process.cwd(), 'site-icon.svg'));
});

app.get('/site-icon.svg', (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'site-icon.svg'));
});

app.get('/site-icon.png', (_req, res) => {
  if (fs.existsSync(path.resolve(process.cwd(), 'site-icon.png'))) {
    return res.sendFile(path.resolve(process.cwd(), 'site-icon.png'));
  }
  return res.sendFile(path.resolve(process.cwd(), 'favicon.png'));
});

// Helper to check admin authorization
function isAuthorized(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token.startsWith('admin_token_secure');
}

// 2. Admin login endpoint - Exige a senha claudio@221 (aceita variações)
app.post('/api/admin/login', (req, res) => {
  const { codigo } = req.body;
  const raw = codigo ? String(codigo).trim() : '';
  const clean = raw.toLowerCase();
  
  if (
    clean === 'claudio@221' ||
    raw === 'claudio@221' ||
    clean === '221122' ||
    clean === 'claudio' ||
    clean === '221' ||
    clean.includes('221')
  ) {
    return res.json({
      success: true,
      token: 'admin_token_secure_' + Date.now()
    });
  }
  return res.status(401).json({
    success: false,
    error: 'Senha incorreta. A senha é claudio@221'
  });
});

// 3. Admin get submissions endpoint
app.get('/api/admin/submissions', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Sessão expirada ou não autorizada. Digite a senha de acesso.' });
  }
  const submissions = getSubmissions();
  return res.json({
    success: true,
    submissions
  });
});

// 4. Admin delete submission endpoint (individual or all)
app.delete('/api/admin/submissions/:id', (req, res) => {
  const { id } = req.params;
  let submissions = getSubmissions();
  submissions = submissions.filter((s: any) => String(s.id).trim() !== String(id).trim());
  saveSubmissions(submissions);
  return res.json({ success: true, message: `Candidato #${id} apagado com sucesso.` });
});

// Delete all submissions
app.delete('/api/admin/submissions', (_req, res) => {
  saveSubmissions([]);
  return res.json({ success: true, message: 'Todos os candidatos foram apagados com sucesso.' });
});

// 5. Admin webhooks resend endpoint - Dispara para o Webhook real
app.post('/api/admin/webhooks/resend', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }
  const { minId, webhookUrl } = req.body;
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    return res.status(400).json({ success: false, error: 'URL do Webhook não informada.' });
  }

  const submissions = getSubmissions();
  const targetSubs = submissions.filter((s: any) => Number(s.id) >= (Number(minId) || 0));

  if (targetSubs.length === 0) {
    return res.json({
      success: true,
      message: `Nenhum candidato encontrado com ID >= ${minId || 0} (Total no banco: ${submissions.length}).`
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'resend_leads',
        total: targetSubs.length,
        leads: targetSubs,
        timestamp: new Date().toISOString()
      })
    });

    return res.json({
      success: true,
      message: `${targetSubs.length} candidato(s) direcionado(s) com sucesso para o Webhook!`
    });
  } catch (err: any) {
    return res.json({
      success: false,
      error: `Falha ao conectar com a URL do Webhook: ${err.message}`
    });
  }
});

// 6. Video config endpoints
const VIDEO_CONFIG_FILE = path.resolve(process.cwd(), 'video-config.json');
const ICON_CONFIG_FILE = path.resolve(process.cwd(), 'icon-config.json');

app.get('/site-icon.svg', (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'site-icon.svg'));
});

app.get('/site-icon.png', (_req, res) => {
  if (fs.existsSync(path.resolve(process.cwd(), 'site-icon.png'))) {
    return res.sendFile(path.resolve(process.cwd(), 'site-icon.png'));
  }
  return res.redirect('/site-icon.svg');
});

app.get('/api/icon', (_req, res) => {
  try {
    if (fs.existsSync(ICON_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(ICON_CONFIG_FILE, 'utf-8'));
      if (data && data.url) {
        return res.json({ success: true, url: data.url });
      }
    }
  } catch {}
  return res.json({ success: true, url: '/site-icon.svg' });
});

app.post('/api/icon', (req, res) => {
  const { url } = req.body;
  try {
    fs.writeFileSync(ICON_CONFIG_FILE, JSON.stringify({ url: (url || '').trim() }, null, 2), 'utf-8');
    return res.json({ success: true, url: (url || '').trim() });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/video', (_req, res) => {
  try {
    if (fs.existsSync(VIDEO_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(VIDEO_CONFIG_FILE, 'utf-8'));
      return res.json({ success: true, url: data.url || '' });
    }
  } catch {}
  return res.json({ success: true, url: '' });
});

app.post('/api/video', (req, res) => {
  const { url } = req.body;
  try {
    fs.writeFileSync(VIDEO_CONFIG_FILE, JSON.stringify({ url: (url || '').trim() }, null, 2), 'utf-8');
    return res.json({ success: true, url: (url || '').trim() });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
