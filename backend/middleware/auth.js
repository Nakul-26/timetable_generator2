import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

const auth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).send({ error: 'Please authenticate.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await Admin.findOne({ _id: decoded.id });

        if (!user) {
            throw new Error();
        }

        req.token = token;
        req.user = user;
        next();
    } catch (error) {
        res.status(401).send({ error: 'Please authenticate.' });
    }
};

export default auth;