const { userFor } = require('../lib/store');

// Who the caller is, so the page can label and colour itself per account.
module.exports = async (req, res) => {
  const user = userFor(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  res.status(200).json({ user: user.name, accent: user.accent });
};
