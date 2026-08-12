const { userFor, listDays } = require('../lib/store');

module.exports = async (req, res) => {
  const user = userFor(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    res.status(200).json(await listDays(user));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
