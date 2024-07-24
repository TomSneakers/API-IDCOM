const cron = require('node-cron');
const { Expo } = require('expo-server-sdk');
const mongoose = require('mongoose');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
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
            const response = await axios.get(urlObj.url, { timeout: 5000 }); // Timeout de 5 secondes
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

cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task at 7am, 12pm, and 8pm');
    try {
        const urls = await Url.find({});
        const results = await testUrls(urls);

        const failedUrls = results.filter(r => r.status !== 200).map(r => r.url);
        if (failedUrls.length > 0) {
            const message = `Des sites sont down : ${failedUrls.join(', ')}`;
            await sendNotification('IDCOM NOTIFICATION', message);
        } else {
            await sendNotification('IDCOM NOTIFICATION', '🎉 ILS VONT BIEN ! 🎉');
        }
    } catch (error) {
        console.error('Error during scheduled task:', error);
    }
}, { timezone: "Europe/Paris" });

app.get('/api/urls-with-status', async (req, res) => {
    try {
        const urls = await Url.find({});
        const results = await testUrls(urls); // Utiliser le schéma d'URL complet

        res.json(results);
    } catch (error) {
        console.error('Error fetching URLs with status:', error);
        res.status(500).json({ error: 'Error fetching URLs with status' });
    }
});

app.post('/api/add-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    try {
        const newUrl = new Url({ url });
        await newUrl.save();
        res.json({ message: 'URL successfully added', url: newUrl });
    } catch (error) {
        console.error('Error adding URL:', error);
        res.status(500).json({ error: 'Error adding URL' });
    }
});

app.get('/api/get-urls', async (req, res) => {
    try {
        const urls = await Url.find({});
        res.json(urls);
    } catch (error) {
        console.error('Error fetching URLs:', error);
        res.status(500).json({ error: 'Error fetching URLs' });
    }
});

app.post('/api/test-urls', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'Invalid URL list' });

    try {
        const results = await testUrls(urls);
        res.json(results);
    } catch (error) {
        console.error('Error testing URLs:', error);
        res.status(500).json({ error: 'Error testing URLs' });
    }
});

app.get('/api/test-all-urls', async (req, res) => {
    try {
        const urls = await Url.find({}).lean();
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

app.get('/api/get-tokens', async (req, res) => {
    try {
        const tokens = await Token.find({});
        res.json(tokens);
    } catch (error) {
        console.error('Error fetching tokens:', error);
        res.status(500).json({ error: 'Error fetching tokens' });
    }
});

app.delete('/api/delete-url', async (req, res) => {
    const { url } = req.body;
    console.log('Request to delete URL:', url);

    if (!url) {
        console.error('Missing URL in request body');
        return res.status(400).json({ error: 'Missing URL' });
    }

    try {
        const result = await Url.deleteOne({ url });
        console.log('Delete result:', result);

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'URL not found' });
        }

        const urls = await Url.find({});
        res.json(urls); // Return updated list of URLs
    } catch (error) {
        console.error('Error deleting URL:', error);
        res.status(500).json({ error: 'Error deleting URL' });
    }
});

app.put('/api/update-url', async (req, res) => {
    const { oldUrl, newUrl } = req.body;
    console.log('Request to update URL:', oldUrl, 'to', newUrl);

    if (!oldUrl || !newUrl) {
        console.error('Missing old URL or new URL in request body');
        return res.status(400).json({ error: 'Missing old URL or new URL' });
    }

    try {
        const result = await Url.findOneAndUpdate({ url: oldUrl }, { url: newUrl }, { new: true });
        console.log('Update result:', result);

        if (!result) {
            return res.status(404).json({ error: 'URL not found' });
        }

        const urls = await Url.find({});
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
