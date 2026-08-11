const { authorized, isDate, isSafeFile, deletePhoto } = require('../lib/store');

module.exports = async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'DELETE only' });

  const { date = '', file = '' } = req.query || {};
  if (!isDate(date) || !isSafeFile(file)) return res.status(400).json({ error: 'bad params' });

  try {
    const del = await deletePhoto(date, file);
    if (!del.ok) return res.status(502).json({ error: await del.text() });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
