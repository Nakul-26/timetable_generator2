const adminAuth = async (req, res, next) => {
    try {
        // req.user is populated by the 'auth' middleware
        if (!req.user) {
            return res.status(403).json({ error: 'Forbidden: Admins only.' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export default adminAuth;
