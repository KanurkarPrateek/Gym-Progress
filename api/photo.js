const { userFor, isDate, isSafeFile, deletePhoto } = require('../lib/store');

module.exports = async (req, res) => {
  const user = userFor(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'DELETE only' });

  const { date = '', file = '' } = req.query || {};
  if (!isDate(date) || !isSafeFile(file)) return res.status(400).json({ error: 'bad params' });

  try {
    const del = await deletePhoto(user, date, file);
    // A miss here means the file isn't in this account's folder — report it as such.
    if (del.status === 404) return res.status(404).json({ error: 'not found' });
    if (!del.ok) return res.status(502).json({ error: await del.text() });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
