import jwt from 'jsonwebtoken';
import Faculty from '../models/Faculty.js';

const auth = async (req, res, next) => {
    try {
        // console.log("*********************** Authentication Middleware ***********************");
        // console.log("request : ",req.cookies.token);
        // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& response : ",res);
        const token = req.cookies.token;
        if (!token) {
            console.log("No token found in cookies");
            return res.status(401).send({ error: 'Please authenticate.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await Faculty.findOne({ _id: decoded.id });

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
