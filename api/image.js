const { userFor, isDate, isSafeFile, getPhoto } = require('../lib/store');

// Proxies a photo out of the caller's own folder in the private bucket.
// Reached via the /uploads/:date/:file rewrite.
module.exports = async (req, res) => {
  const user = userFor(req);
  if (!user) return res.status(401).send('unauthorized');

  const { date = '', file = '' } = req.query || {};
  if (!isDate(date) || !isSafeFile(file)) return res.status(400).send('bad path');

  try {
    const img = await getPhoto(user, date, file);
    if (!img.ok) return res.status(404).send('not found');
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.status(200).send(Buffer.from(await img.arrayBuffer()));
  } catch (e) {
    res.status(500).send(e.message);
  }
};
