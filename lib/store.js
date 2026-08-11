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

// The password gate. With no APP_PASSWORD set (local dev) everything is allowed.
// Checked from a header for fetch() calls, or a cookie for <img> requests,
// which cannot carry custom headers.
function authorized(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const cookie = /(?:^|;\s*)gym_key=([^;]*)/.exec(req.headers.cookie || '');
  const given = req.headers['x-gym-key'] || (cookie ? decodeURIComponent(cookie[1]) : '');
  return given.length === expected.length && given === expected;
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

// Every day that has photos, newest first.
async function listDays() {
  const top = await sbList('');
  const dates = top.filter((e) => isDate(e.name)).map((e) => e.name);
  const days = await Promise.all(
    dates.map(async (date) => {
      const items = await sbList(`${date}/`);
      return { date, photos: items.map((i) => i.name).filter(isImage).sort() };
    })
  );
  return days.filter((d) => d.photos.length > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// dataUrl -> stored object. Returns the stored filename.
async function savePhoto(date, dataUrl, seq = 0) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('not an image data URL');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${Date.now()}-${seq}.${ext}`;
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${date}/${name}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': `image/${m[1]}`, 'x-upsert': 'true' }),
    body: Buffer.from(m[2], 'base64'),
  });
  if (!res.ok) throw new Error(`storage: ${await res.text()}`);
  return name;
}

const getPhoto = (date, file) =>
  fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${date}/${file}`, { headers: sbHeaders() });

const deletePhoto = (date, file) =>
  fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${date}/${file}`, {
    method: 'DELETE',
    headers: sbHeaders(),
  });

module.exports = {
  BUCKET, isDate, isSafeFile, isImage, authorized,
  ensureBucket, listDays, savePhoto, getPhoto, deletePhoto,
};
