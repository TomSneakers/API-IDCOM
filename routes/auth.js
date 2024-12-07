const express = require('express');
const jwt = require('jsonwebtoken');
const { Expo } = require('expo-server-sdk');
const User = require('../models/User');
const Token = require('../models/token');
const { authenticateToken, checkRole } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';


router.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;

    console.log("Received signup request:", req.body);

    if (!username || !password) {
        console.error("Missing username or password");
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.error("Username already exists");
            return res.status(409).json({ error: 'Username already exists' });
        }

        const user = new User({ username, password });
        console.log("Attempting to save new user...");
        await user.save();

        // Génère un token JWT
        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '1h' }
        );

        console.log("User successfully created:", user);
        res.status(201).json({ message: 'User created', token });
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});


// Route to add token
router.post('/api/add-token', authenticateToken, async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    if (!Expo.isExpoPushToken(token)) return res.status(400).json({ error: 'Invalid token' });

    try {
        const existingToken = await Token.findOne({ token, userId });
        if (existingToken) {
            return res.status(200).json({ message: 'Token already registered', token: existingToken });
        }

        const newToken = new Token({ token, userId });
        await newToken.save();
        res.json({ message: 'Token successfully added', token: newToken });
    } catch (error) {
        console.error('Error adding token:', error);
        res.status(500).json({ error: 'Error adding token' });
    }
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
