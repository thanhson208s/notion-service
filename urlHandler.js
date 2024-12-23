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
        const htmlContent = fs.readFileSync(path.resolve(process.cwd(), 'static/index.html'), 'utf-8');
        const cssContent = fs.readFileSync(path.resolve(process.cwd(), 'static/styles.css'), 'utf-8');
        const jsContent = fs.readFileSync(path.resolve(process.cwd(), 'static/script.js'), 'utf-8');
        const fullHtml = htmlContent
            .replace('<style></style>', `<style>${cssContent}</style>`)
            .replace('<script></script>', `<script>${jsContent}</script>`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
            },
            body: fullHtml
        };
    } catch(error) {
        console.error("Error serving files:", error);
        return {
            statusCode: 500,
            body: error.message
        };
    }
}