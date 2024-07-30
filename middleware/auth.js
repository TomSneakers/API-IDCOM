const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Middleware for token verification
const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware for role verification
const checkRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};
const checkApiKey = (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (apiKey !== process.env.CRON_API_KEY) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
};

module.exports = {
    authenticateToken,
    checkRole,
    checkApiKey,
};
