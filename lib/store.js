// Shared Supabase Storage logic, used by both the local server and the Vercel functions.

const BUCKET = 'gym-photos';

const SUPABASE_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET_KEY = () => process.env.SUPABASE_SECRET_KEY || '';

const sbHeaders = (extra = {}) => ({
  Authorization: `Bearer ${SECRET_KEY()}`,
  apikey: SECRET_KEY(),
  ...extra,
});

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isSafeFile = (s) => typeof s === 'string' && /^[\w.\- ]+$/.test(s) && !s.includes('..');
const isImage = (f) => /\.(jpe?g|png|webp)$/i.test(f);

// --- accounts ---
// USERS="name:password:#accent,other:password2:#accent2" (accent optional).
// Falls back to APP_PASSWORD as a single account, or to an open local dev account.
const FALLBACK_ACCENTS = ['#4ade80', '#60a5fa', '#fb923c', '#a78bfa', '#f472b6'];

function accounts() {
  const raw = (process.env.USERS || '').trim();
  if (raw) {
    return raw
      .split(',')
      .map((entry, i) => {
        const [name, password, accent] = entry.split(':').map((s) => (s || '').trim());
        if (!name || !password || !/^[\w-]+$/.test(name)) return null;
        return { name, password, accent: accent || FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length] };
      })
      .filter(Boolean);
  }
  if (process.env.APP_PASSWORD) {
    return [{ name: 'me', password: process.env.APP_PASSWORD, accent: FALLBACK_ACCENTS[0] }];
  }
  return []; // no accounts configured — open, for local dev
}

// Resolves the caller to an account. The key arrives in a header for fetch()
// calls, or a cookie for <img> requests, which cannot carry custom headers.
// Returns null when the key matches nothing.
function userFor(req) {
  const list = accounts();
  if (list.length === 0) return { name: 'local', accent: FALLBACK_ACCENTS[0], open: true };
  const cookie = /(?:^|;\s*)gym_key=([^;]*)/.exec(req.headers.cookie || '');
  const given = req.headers['x-gym-key'] || (cookie ? decodeURIComponent(cookie[1]) : '');
  if (!given) return null;
  return list.find((u) => u.password.length === given.length && u.password === given) || null;
}

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/bucket/${BUCKET}`, { headers: sbHeaders() });
  if (res.ok) return;
  const create = await fetch(`${SUPABASE_URL()}/storage/v1/bucket`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: BUCKET, id: BUCKET, public: false }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`could not create bucket: ${create.status} ${await create.text()}`);
  }
}

async function sbList(prefix) {
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Each account owns a folder: gym-photos/<user>/YYYY-MM-DD/<file>.
// The prefix always comes from the resolved account, never from the request,
// so one account cannot address another's photos.
const home = (user) => `${user.name}/`;

// Every day that has photos, newest first.
async function listDays(user) {
  const top = await sbList(home(user));
  const dates = top.filter((e) => isDate(e.name)).map((e) => e.name);
  const days = await Promise.all(
    dates.map(async (date) => {
      const items = await sbList(`${home(user)}${date}/`);
      return { date, photos: items.map((i) => i.name).filter(isImage).sort() };
    })
  );
  return days.filter((d) => d.photos.length > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// dataUrl -> stored object. Returns the stored filename.
async function savePhoto(user, date, dataUrl, seq = 0) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('not an image data URL');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${Date.now()}-${seq}.${ext}`;
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${home(user)}${date}/${name}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': `image/${m[1]}`, 'x-upsert': 'true' }),
    body: Buffer.from(m[2], 'base64'),
  });
  if (!res.ok) throw new Error(`storage: ${await res.text()}`);
  return name;
}

const getPhoto = (user, date, file) =>
  fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${home(user)}${date}/${file}`, {
    headers: sbHeaders(),
  });

const deletePhoto = (user, date, file) =>
  fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${home(user)}${date}/${file}`, {
    method: 'DELETE',
    headers: sbHeaders(),
  });

module.exports = {
  BUCKET, isDate, isSafeFile, isImage, accounts, userFor,
  ensureBucket, listDays, savePhoto, getPhoto, deletePhoto,
};
