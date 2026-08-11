// Local dev server. It runs the exact same handlers Vercel does (api/*.js),
// wrapping Node's req/res in the small Express-ish shape those handlers expect.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT || 4321;

// --- config (.env, overridable by real env vars) ---
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('\nMissing config. Fill in .env:\n  SUPABASE_URL=https://<your-ref>.supabase.co\n  SUPABASE_SECRET_KEY=sb_secret_...\n');
  process.exit(1);
}

const { ensureBucket, isDate, isSafeFile } = require('./lib/store');
const handlers = {
  '/api/days': require('./api/days'),
  '/api/upload': require('./api/upload'),
  '/api/photo': require('./api/photo'),
  '/api/image': require('./api/image'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function readBody(req, limitBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Give res the .status().json()/.send() shape the handlers use.
function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  res.send = (data) => res.end(data);
  return res;
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  decorate(res);
  req.query = Object.fromEntries(url.searchParams);

  // /uploads/:date/:file -> api/image (mirrors the vercel.json rewrite)
  const up = pathname.split('/').filter(Boolean);
  if (up[0] === 'uploads') {
    if (up.length !== 3 || !isDate(up[1]) || !isSafeFile(up[2])) return res.status(400).send('bad path');
    req.query = { date: up[1], file: up[2] };
    return handlers['/api/image'](req, res);
  }

  if (handlers[pathname]) {
    if (req.method === 'POST') {
      try {
        req.body = JSON.parse((await readBody(req)) || '{}');
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    return handlers[pathname](req, res);
  }

  const file = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (!isSafeFile(file)) return res.status(400).send('bad path');
  serveStatic(res, path.join(PUBLIC, file));
});

ensureBucket()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Gym progress tracker running at http://localhost:${PORT}`);
      console.log(`Photos stored in Supabase bucket "gym-photos" (${process.env.SUPABASE_URL})`);
      if (!process.env.APP_PASSWORD) console.log('No APP_PASSWORD set — the password gate is off locally.');
    });
  })
  .catch((e) => {
    console.error('Supabase check failed:', e.message);
    process.exit(1);
  });
