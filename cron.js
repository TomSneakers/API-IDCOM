//tache cron pour vercel
import { MongoClient } from 'mongodb';
import { testUrls, sendNotification } from '../utils';
import { Expo } from 'expo-server-sdk';
import Token from '../models/token';
import 'dotenv/config';
import { Token } from '../models/token';
import { Expo } from 'expo-server-sdk';
import { MongoClient } from 'mongodb';
import { testUrls } from '../utils';
import 'dotenv/config';
const expo = new Expo();


const MONGO_URI = process.env.MONGODB_URI;
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
export default async function handler(req, res) {
    async function handleCronJob() {
        console.log('Running scheduled task at 7am, 12pm, and 8pm');

        let client;
        try {
            client = await MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
            const db = client.db();
            const urls = await db.collection('urls').find({}).toArray();

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
        } finally {
            if (client) {
                client.close();
            }
        }
    }

    await handleCronJob();
    res.status(200).json({ message: 'Scheduled task executed successfully' });
}