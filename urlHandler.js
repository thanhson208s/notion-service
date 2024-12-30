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

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

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

    const callbackWithAuthorization = (event) => {
        if (method === "GET") {
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
        }

        return callback(event);
    }

    controllers.set(`${method.toUpperCase()} ${path}`, callbackWithAuthorization);
    controllers.set(`${method.toUpperCase()} ${path}/`, callbackWithAuthorization);
}

registerController("GET", "/form", async (event) => {
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

registerController("POST", "/form", async (event) => {
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

registerController("GET", "/routine", async(event) => {
    //get today's routine list
    const response = await notion.databases.query({
        database_id: process.env.NOTION_RECORD_LIST_DATABASE_ID,
        filter: {
            property: 'Reminder',
            date: {
                on_or_after: moment().format('YYYY-MM-DD')
            }
        }
    });

    if (!response.object || response.object !== "list") {
        throw new Error("Query checklist failed!", {cause: response});
    }

    //sort records by hour and minute in reminder property
    const sortedRecords = response.results.sort((a, b) => {
        const aHour = a.properties["Reminder"].date.start.split("T")[1].split(":")[0];
        const aMinute = a.properties["Reminder"].date.start.split("T")[1].split(":")[1];
        const bHour = b.properties["Reminder"].date.start.split("T")[1].split(":")[0];
        const bMinute = b.properties["Reminder"].date.start.split("T")[1].split(":")[1];

        if (aHour === bHour) {
            return aMinute - bMinute;
        }
        else return aHour - bHour;
    });

    //map records to a list of object with:
    // + id: record id
    // + name: {hour:minute} {Name} ({Progress}/{Requirement})
    // + hasProgress: true if Requiremnt is not empty
    const bodyResponse = response.results.map(page => {
        const hour = page.properties["Reminder"].date.start.split("T")[1].split(":")[0];
        const minute = page.properties["Reminder"].date.start.split("T")[1].split(":")[1];
        const name = page.properties["Name"].title[0].text.content.split('|')[0].trim();
        const progress = page.properties["Progress"].number ?? 0;
        const requirement = page.properties["Requirement"].number;
        const isDone = page.properties["Done"].formula.boolean;

        return {
            id: page.id,
            name: `${isDone ? "✅" : "❌"} ${hour}:${minute} ${name} (${requirement != null ? (progress.toString() + '/' + requirement.toString()) : (isDone ? "Done" : "Undone")})`,
            hasProgress: requirement != null
        };
    });

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyResponse)
    };
});

registerController("POST", "/routine", async(event) => {

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