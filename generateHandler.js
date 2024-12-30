import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import moment from 'moment-timezone';
import axios from 'axios';

// Load environment variables
if (process.env.NODE_ENV !== 'production')
    dotenv.config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Test start from here
const todayDate = moment().tz('Asia/Bangkok').format('YYYY-MM-DD');

// Send Telegram alert
const sendTelegramMessage = async(message) => {
    if (process.env.NODE_ENV !== 'production') return;

    try {
        const url = process.env.TELEGRAM_URL.replace("{{message}}", encodeURIComponent(message));
        await axios.get(url);
    } catch(error) {
        console.error("Error sending telegram message:", error);
    }
}

// Get all the word entries that need reviewing today
const getTodayWordList = async() => {
    try {
        //send database query
        const response = await notion.databases.query({
            database_id: process.env.NOTION_WORD_LIST_DATABASE_ID,
            filter: {
                and: [
                    {
                        property: 'Next reviewed date',
                        formula: {
                            date: {
                                equals: todayDate
                            }
                        }
                    },
                    {
                        property: 'Completed',
                        formula: {
                            checkbox: {
                                equals: false
                            }
                        }
                    },
                    {
                        property: 'Draft',
                        checkbox: {
                            equals: false
                        }
                    }
                ]
            }
        });

        //check for valid response
        if (!response.object || response.object !== "list") {
            throw new Error("Query databases failed!", {cause: response});
        }
            
        return response.results;
    } catch (error) {
        throw new Error("Error while getting today's word list", {cause: error});
    }
}

// Create the page for today's attempt
const createTodayAttempt = async(results) => {
    try {
        //send page creation request
        const responsePage = await notion.pages.create({
            parent: {
                database_id: process.env.NOTION_ATTEMPTS_DATABASE_ID
            },
            properties: {
                "Name": {
                    "type": "title",
                    "title": [
                        {
                            "text": {
                                "content": todayDate    // Title set to today's date
                            }
                        }
                    ]
                },
                "Date": {
                    "type": "date",
                    "date": {
                        start: todayDate
                    }
                }
            }
        });

        //check for valid response
        if (!responsePage.object || responsePage.object !== "page") {
            throw new Error("Create page failed!", {cause: responsePage});
        }

        //create a practice for each word
        await Promise.all(
            results.map(async(page) => {
                //send page creation request
                const responsePractice = await notion.pages.create({
                    parent: {
                        database_id: process.env.NOTION_PRACTICE_LIST_DATABASE_ID
                    },
                    properties: {
                        "Name": {
                            "type": "title",
                            "title": [
                                {
                                    "text": {
                                        "content": page.properties["Word"].title[0].text.content + " | " + todayDate
                                    }
                                }
                            ]
                        },
                        "Word": {
                            "type": "relation",
                            "relation": [
                                {
                                    "id": page.id
                                }
                            ]
                        },
                        "Attempt": {
                            "type": "relation",
                            "relation": [
                                {
                                    "id": responsePage.id
                                }
                            ]
                        },
                        "Level": {
                            "type": "number",
                            "number": page.properties["Level"].formula.number
                        },
                        "Date": {
                            "type": "date",
                            "date": {
                                start: todayDate
                            }
                        }
                    }
                });

                //check for valid response
                if (!responsePractice.object || responsePractice.object !== "page") {
                    throw new Error("Create practice failed!", {cause: responsePractice});
                }
            })
        );
    } catch (error) {
        throw new Error("Error while create today's attempt page", {cause: error});
    }
}

// Handler for generate task
export const handler = async (event) => {
    try {
        await sendTelegramMessage("Start generate today's attempt");
        console.log("Start generate today's attempt");
        const results = await getTodayWordList();
        await sendTelegramMessage(`Number of words to practice today: ${results.length}`);
        console.log(`Number of words to practice today: ${results.length}`);
        if (results.length > 0)
            await createTodayAttempt(results);
        await sendTelegramMessage("Finish generate today's attempt");
        console.log("Finish generate today's attempt");
    } catch (error) {
        await sendTelegramMessage("Error generate today's attempt");
        console.log(error);
    }
}