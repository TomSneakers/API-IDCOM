const express = require('express');
const User = require('../models/User');
const { authenticateToken, checkRole } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = 'your_jwt_secret';

// Signup
router.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    const user = new User({ username, password });
    await user.save();
    res.status(201).json({ message: 'User created' });
});

// Login
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = user.generateAuthToken();
    res.json({ token });
});

// Protected route example
router.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Protected route accessed!' });
});

// Example of a role-protected route
router.post('/admin-only', authenticateToken, checkRole(['admin']), (req, res) => {
    res.json({ message: 'Admin route accessed!' });
});

module.exports = router;
