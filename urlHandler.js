import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
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
        console.log(`Extracted client info: ${clientIP}:${clientPort}`);
        sendTelegramMessage(`Extracted client info: ${clientIP}:${clientPort}`);

        const response = {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: `${clientIP}:${clientPort}`
        };

        return response;
    } catch(error) {
        console.error("Error extracting client information:", error);
        sendTelegramMessage("Error extracting client information");

        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Error extracting client information",
                error: error.message
            })
        };
    }
}