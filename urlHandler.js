import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs'
import path from 'path'

// Load environment variables
if (process.env.NODE_ENV !== 'production')
    dotenv.config();

// Send Telegram alert
const sendTelegramMessage = async(message) => {
    try {
        const url = process.env.TELEGRAM_URL.replace("{{message}}", encodeURIComponent(message));
        await axios.get(url);
    } catch(error) {
        console.error("Error sending telegram message:", error);
    }
}

export const handler = async(event) => {
    console.log("New client request:", event);

    try {
        const clientIP = event.headers?.['x-forwarded-for'] ?? "Unknown IP";
        const clientPort = event.headers?.['x-forwarded-port'] ?? "Unknown port";
        sendTelegramMessage(`New request from: ${clientIP}:${clientPort}`);

        const htmlContent = fs.readFileSync(path.resolve(process.cwd(), 'static/index.html'), 'utf-8');
        const cssContent = fs.readFileSync(path.resolve(process.cwd(), 'static/index.css'), 'utf-8');
        const fullHtml = htmlContent.replace('<style></style>', `<style>${cssContent}</style>`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
            },
            body: fullHtml
        };
    } catch(error) {
        console.error("Error serving HTML or CSS:", error);
        return {
            statusCode: 500,
            body: error.message
        };
    }
}