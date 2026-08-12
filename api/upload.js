const { userFor, isDate, ensureBucket, savePhoto } = require('../lib/store');

// One photo per request — Vercel caps request bodies at 4.5MB.
module.exports = async (req, res) => {
  const user = userFor(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { date, dataUrl, seq = 0 } = body;
    if (!isDate(date)) return res.status(400).json({ error: 'bad date' });

    await ensureBucket();
    const name = await savePhoto(user, date, dataUrl, seq);
    res.status(200).json({ saved: 1, name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
