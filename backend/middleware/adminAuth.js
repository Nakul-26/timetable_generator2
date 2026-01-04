const adminAuth = (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only.' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export default adminAuth;
