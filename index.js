const cron = require('node-cron');
const { Expo } = require('expo-server-sdk');
const mongoose = require('mongoose');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { authenticateToken, checkRole } = require('./middleware/auth');
require('dotenv').config();

const expo = new Expo();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

console.log(`Connecting to MongoDB URI: ${process.env.MONGODB_URI}`);

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
    });

app.use('/api', authRoutes);

const urlSchema = new mongoose.Schema({
    url: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: null } // Role that can access this URL
});

const Url = mongoose.model('Url', urlSchema);

const tokenSchema = new mongoose.Schema({
    token: { type: String, required: true }
});
const Token = mongoose.model('Token', tokenSchema);

const testUrls = async (urls) => {
    return Promise.all(urls.map(async (urlObj) => {
        let status;
        try {
            console.log(`Testing URL: ${urlObj.url}`);
            const response = await axios.get(urlObj.url, { timeout: 5000 });
            status = response.status;
            console.log(`URL: ${urlObj.url} responded with status: ${status}`);
        } catch (error) {
            if (error.response) {
                status = error.response.status;
                console.error(`Error response for URL ${urlObj.url}: ${status}`);
            } else if (error.request) {
                console.error(`No response received for URL ${urlObj.url}`);
                status = 'No response'; // Utilisez une chaîne pour représenter l'absence de réponse
            } else {
                console.error(`Error setting up request for URL ${urlObj.url}:`, error.message);
                status = 'Error';
            }
        }
        return { url: urlObj.url, status };
    }));
};

const sendNotification = async (title, message) => {
    try {
        const tokens = await Token.find({});
        const messages = tokens.filter(({ token }) => Expo.isExpoPushToken(token)).map(({ token }) => ({
            to: token,
            sound: 'default',
            title,
            body: message,
            data: { withSome: 'data' },
        }));

        if (messages.length > 0) {
            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                try {
                    const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                    console.log('Sent chunk:', ticketChunk);
                } catch (error) {
                    console.error('Error sending notifications:', error);
                }
            }
        } else {
            console.log('No valid tokens to send notifications to.');
        }
    } catch (error) {
        console.error('Error preparing notifications:', error);
    }
};

app.post('/api/add-token', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    if (!Expo.isExpoPushToken(token)) return res.status(400).json({ error: 'Invalid token' });

    try {
        const existingToken = await Token.findOne({ token });
        if (existingToken) {
            return res.status(200).json({ message: 'Token already registered', token: existingToken });
        }

        const newToken = new Token({ token });
        await newToken.save();
        res.json({ message: 'Token successfully added', token: newToken });
    } catch (error) {
        console.error('Error adding token:', error);
        res.status(500).json({ error: 'Error adding token' });
    }
});

// Ajoutez cette route pour exécuter la tâche cron
app.get('/api/run-cron-task', authenticateToken, async (req, res) => {
    console.log('Running scheduled task via external trigger');
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        // Récupérer les URLs associées à l'utilisateur ou à son rôle
        const urls = await Url.find({ $or: [{ userId }, { role: userRole }] });
        const results = await testUrls(urls);

        const failedUrls = results.filter(r => r.status !== 200).map(r => r.url);
        if (failedUrls.length > 0) {
            const message = `Des sites sont down : ${failedUrls.join(', ')}`;
            await sendNotification('IDCOM NOTIFICATION', message);
        } else {
            await sendNotification('IDCOM NOTIFICATION', '🎉 ILS VONT BIEN ! 🎉');
        }
        res.json({ message: 'Scheduled task executed successfully' });
    } catch (error) {
        console.error('Error during scheduled task:', error);
        res.status(500).json({ error: 'Error during scheduled task' });
    }
});


app.get('/api/urls-with-status', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const urls = await Url.find({ userId });
        const results = await testUrls(urls);
        res.json(results);
    } catch (error) {
        console.error('Error fetching URLs with status:', error);
        res.status(500).json({ error: 'Error fetching URLs with status' });
    }
});

app.post('/api/add-url', authenticateToken, async (req, res) => {
    const { url, role } = req.body;
    const userId = req.user.id;

    if (!url) return res.status(400).json({ error: 'Missing URL' });

    try {
        const newUrl = new Url({ url, userId, role });
        await newUrl.save();
        res.json({ message: 'URL successfully added', url: newUrl });
    } catch (error) {
        console.error('Error adding URL:', error);
        res.status(500).json({ error: 'Error adding URL' });
    }
});

app.get('/api/get-urls', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const urls = await Url.find({ userId });
        res.json(urls);
    } catch (error) {
        console.error('Error fetching URLs:', error);
        res.status(500).json({ error: 'Error fetching URLs' });
    }
});

app.post('/api/test-urls', authenticateToken, async (req, res) => {
    const { urls } = req.body;
    const userId = req.user.id;

    if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'Invalid URL list' });

    try {
        const userUrls = await Url.find({ userId, url: { $in: urls } });
        const results = await testUrls(userUrls);
        res.json(results);
    } catch (error) {
        console.error('Error testing URLs:', error);
        res.status(500).json({ error: 'Error testing URLs' });
    }
});

app.get('/api/test-all-urls', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const urls = await Url.find({ userId }).lean();
        const results = await testUrls(urls);
        res.json(results.map(result => ({
            url: result.url,
            status: result.status,
        })));
    } catch (error) {
        console.error('Error testing all URLs:', error);
        res.status(500).json({ error: 'Error testing all URLs' });
    }
});

app.get('/api/get-tokens', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const tokens = await Token.find({});
        res.json(tokens);
    } catch (error) {
        console.error('Error fetching tokens:', error);
        res.status(500).json({ error: 'Error fetching tokens' });
    }
});

app.delete('/api/delete-url', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const userId = req.user.id;

    if (!url) {
        console.error('Missing URL in request body');
        return res.status(400).json({ error: 'Missing URL' });
    }

    try {
        const result = await Url.deleteOne({ url, userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'URL not found' });
        }

        const urls = await Url.find({ userId });
        res.json(urls); // Return updated list of URLs
    } catch (error) {
        console.error('Error deleting URL:', error);
        res.status(500).json({ error: 'Error deleting URL' });
    }
});

app.put('/api/update-url', authenticateToken, async (req, res) => {
    const { oldUrl, newUrl } = req.body;
    const userId = req.user.id;

    if (!oldUrl || !newUrl) {
        console.error('Missing old URL or new URL in request body');
        return res.status(400).json({ error: 'Missing old URL or new URL' });
    }

    try {
        const result = await Url.findOneAndUpdate({ url: oldUrl, userId }, { url: newUrl }, { new: true });
        if (!result) {
            return res.status(404).json({ error: 'URL not found' });
        }

        const urls = await Url.find({ userId });
        res.json(urls); // Return updated list of URLs
    } catch (error) {
        console.error('Error updating URL:', error);
        res.status(500).json({ error: 'Error updating URL' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});

module.exports = app;
