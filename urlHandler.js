import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import moment from 'moment'
import { Client } from '@notionhq/client'

// Load environment variables
if (process.env.NODE_ENV !== 'production')
    dotenv.config();

/**
 * Send Telegram alert
 * @param {string} message 
 */
const sendTelegramMessage = async(message) => {
    try {
        const url = process.env.TELEGRAM_URL.replace("{{message}}", encodeURIComponent(message));
        await axios.get(url);
    } catch(error) {
        console.error("Error sending telegram message:", error);
    }
}

const controllers = new Map();

/**
 * Register controllers for different methods and paths
 * @param {string} method 
 * @param {*} path 
 * @param {*} callback 
 */
const registerController = (method, path, callback) => {
    path = path.endsWith("/") ? path.slice(0, -1) : path;
    controllers.set(`${method.toUpperCase()} ${path}`, callback);
    controllers.set(`${method.toUpperCase()} ${path}/`, callback);
}

registerController("GET", "/", async (event) => {
    const clientHash = event.queryStringParameters["hash"];
    const hash = crypto.createHash('sha256');
    hash.update(process.env.NOTION_API_KEY, 'utf-8');
    const serverHash = hash.digest('hex');

    if (clientHash !== serverHash) {
        console.log(`Wrong authorization key (${clientHash})`);
        return {
            statusCode: 401,
            body: "Unauthorized"
        };
    }

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
});

registerController("POST", "/", async (event) => {
    let name = "";
    let ipa = "";
    let meaning = "";
    let examples = "";
    let isDraft = false;

    try {
        const data = JSON.parse(event.body);
        name = data["name"];
        if (!name) throw new Error("Invalid or empty name!");
        ipa = data["ipa"];
        if (!ipa) throw new Error("Invalid or empty IPA");
        meaning = data["meaning"];
        if (!meaning) throw new Error("Invlaid or empty meaning");
        examples = data["examples"];
        if (!examples) throw new Error("Invalid or empty examples");
        isDraft = data["isDraft"] ?? false;
    } catch(error) {
        console.log("Error parsing request body:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({
                description: "Invalid form data!",
                message: error.message
            })
        };
    }

    const notion = new Client({ auth: process.env.NOTION_API_KEY });
    try {
        const response = await notion.pages.create({
            parent: {
                type: "database_id",
                database_id: process.env.NOTION_WORD_LIST_DATABASE_ID
            },
            properties: {
                "Word": {
                    type: "title",
                    title: [
                        {
                            text: {
                                content: name
                            }
                        }
                    ]
                },
                "Level": {
                    type: "number",
                    number: 0
                },
                "IPA": {
                    type: "rich_text",
                    rich_text: [
                        {
                            type: "text",
                            text: {
                                content: ipa
                            }
                        }
                    ]
                },
                "Meaning": {
                    type: "rich_text",
                    rich_text: [
                        {
                            type: "text",
                            text: {
                                content: meaning
                            }
                        }
                    ]
                },
                "Examples": {
                    type: "rich_text",
                    rich_text: [
                        {
                            type: "text",
                            text: {
                                content: examples
                            }
                        }
                    ]
                },
                "Published date": {
                    type: "date",
                    date: {
                        start: moment().format('YYYY-MM-DD')
                    }
                },
                "Draft": {
                    type: "checkbox",
                    checkbox: isDraft
                }
            }
        });

        //check for valid response
        if (!response.object || response.object !== "page") {
            throw new Error("Add new word failed!", {cause: response});
        }
    } catch(error) {
        console.log(error);
        return {
            statusCode: 502,
            body: JSON.stringify({
                description: "Notion error!",
                message: error.message
            })
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            description: "New word added!"
        })
    };
});

export const handler = async(event) => {
    console.log("New client request:", event);
    
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;
    const controller = controllers.get(`${method.toUpperCase()} ${path}`);
    if (!controller) {
        console.log(`No controller for request (${method.toUpperCase()} ${path})`)
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'text/plain'
            },
            body: "Not found"
        };
    }

    try {
        return await controller(event);
    } catch(error) {
        console.error("Server error: ", error);
        await sendTelegramMessage(`Server error ${error.message}`);

        return {
            statusCode: 500,
            body: JSON.stringify({
                description: "Internal server error!",
                message: error.message
            })
        };
    }
}