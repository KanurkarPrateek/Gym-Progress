const { authorized, listDays } = require('../lib/store');

module.exports = async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    res.status(200).json(await listDays());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
