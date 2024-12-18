import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import moment from 'moment';
import axios from 'axios';

// Load environment variables
if (process.env.NODE_ENV !== 'production')
    dotenv.config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Test start from here
const todayDate = moment().format('YYYY-MM-DD');

// Send Telegram alert
const sendTelegramMessage = async(message) => {
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
                        date: {
                            equals: todayDate
                        }
                    },
                    {
                        property: 'Completed',
                        checkbox: {
                            equals: false
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
                "Date": {
                    "type": "title",
                    "title": [
                        {
                            "text": {
                                "content": todayDate    // Title set to today's date
                            }
                        }
                    ]
                },
                "Count": {
                    "type": "number",
                    "number": results.length
                },
                "Reviewed": {
                    "type": "checkbox",
                    "checkbox": false
                },
                "Grade": {
                    "type": "number",
                    "number": 0
                }
            }
        });

        //check for valid response
        if (!responsePage.object || responsePage.object !== "page") {
            throw new Error("Create page failed!", {cause: responsePage});
        }

        //create list row data for the table in the newly created page
        const wordTasks = results.map((page) => ({
            object: "block",
            type: "table_row",
            table_row: {
                cells: [
                    [
                        {
                            type: "mention",
                            mention: {
                                type: "page",
                                page: {
                                    id: page.id
                                }
                            },
                            href: page.url
                        }
                    ],
                    [
                        {
                            type: "text",
                            text: {
                                content: page.properties["Level"]?.number?.toString() || "N/A"
                            }
                        }
                    ],
                    [
                        {
                            type: "text",
                            text: {
                                content: "" //leave blank to input pronunciation
                            }
                        }
                    ],
                    [
                        {
                            type: "text",
                            text: {
                                content: "" //leave blank to input meaning
                            }
                        }
                    ],
                    [
                        {
                            type: "text",
                            text: {
                                content: "" //leave blank to input examples
                            }
                        }
                    ],
                    [
                        {
                            type: "text",
                            text: {
                                content: "Correct/Wrong" //choose either of 2 outcomes, but not both
                            }
                        }
                    ]
                ]
            }
        }));

        //add a table block to content of the newly created page
        const responseTable = await notion.blocks.children.append({
            block_id: responsePage.id,
            children: [
                {
                    object: "block",
                    type: "table",
                    table: {
                        table_width: 6,
                        has_column_header: true,
                        has_row_header: false,
                        children: [
                            {
                                object: "block",
                                type: "table_row",
                                table_row: {
                                    cells: [
                                        [{ type: 'text', text: { content: 'Word' } }],
                                        [{ type: 'text', text: { content: 'Level' } }],
                                        [{ type: 'text', text: { content: 'Pronunciation' } }],
                                        [{ type: 'text', text: { content: 'Meaning' } }],
                                        [{ type: 'text', text: { content: 'Examples' } }],
                                        [{ type: 'text', text: { content: 'Result' } }]
                                    ]
                                }
                            }, ...wordTasks
                        ]
                    }
                }
            ]
        });

        if (!responseTable.object || responseTable.object !== "list") {
            throw new Error("Create table failed!", {cause: responseTable});
        }

        //add guildline comment to the newly created page
        const responseComment = await notion.comments.create({
            parent: {
                page_id: responsePage.id
            },
            rich_text: [
                {
                    type: "text",
                    text: {
                        content: "Choose either of 2 results, but not both.\nMeaning and Examples must not be left blank."
                    } 
                }
            ]
        });

        if (!responseComment.object || responseComment.object !== "comment") {
            throw new Error("Create comment failed!", {cause: responseComment});
        }
    } catch (error) {
        throw new Error("Error while create today's attempt page", {cause: error});
    }
}

// Handler for generate task
export const handler = async (event) => {
    console.log(`Generating task triggered at: ${event.time}`);

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