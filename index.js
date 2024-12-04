import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import moment from 'moment';

// Load environment variables
dotenv.config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Test start from here
const todayDate = moment().format('YYYY-MM-DD');

// Get all the word entries that need reviewing today
const getTodayWordList = async() => {
    try {
        //send database query
        const response = await notion.databases.query({
            database_id: process.env.NOTION_WORD_LIST_DATABASE_ID,
            filter: {
                property: 'Next reviewed date',
                date: {
                    equals: todayDate
                }
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

// Get all latest attempts that have not been reviewed yet
const getLastAttempts = async() => {
    try {
        //send database query
        const response = await notion.databases.query({
            database_id: process.env.NOTION_ATTEMPTS_DATABASE_ID,
            filter: {
                property: "Reviewed",
                checkbox: {
                    equals: false
                }
            },
            sorts: [
                {
                    timestamp: "created_time",
                    direction: "ascending"
                }
            ],
            page_size: 1
        });

        //check valid resonse
        if (!response.object || response.object !== "list") {
            throw new Error("Query databases failed!", {cause: response});
        }

        return response.results;
    } catch (error) {
        throw new Error("Error while getting last attempt", {cause: error});
    }
}

// Reassign the level for each word based on the result of the attempt
const reassignWordLevels = async(results) => {
    try {
        results.forEach(async(page) => {
            //request the table in page
            const responseTable = await notion.blocks.children.list({
                block_id: page.id,
                page_size: 1
            });

            if (!responseTable.object || responseTable.object !== "list" || responseTable.results[0]?.type !== "table") {
                throw new Error("Retrieve table failed!", {cause: responseTable});
            }

            //request table rows
            const responseRows = await notion.blocks.children.list({
                block_id: responseTable.results[0].id
            });

            if (!responseRows.object || responseRows.object !== "list") {
                throw new Error("Retrieve rows failed!", {cause: responseRows});
            }

            //remove header row
            const rows = responseRows.results;
            if (responseTable.results[0].table.has_column_header)
                rows.shift();

            rows.forEach(async(row) => {
                //request page object
                const cells = row.table_row.cells;
                const pageId = cells[0][0].mention.page.id;
                const responsePage = await notion.pages.retrieve({ 
                    page_id: pageId
                });

                //check valid response
                if (!responsePage.object || responsePage.object !== "page") {
                    throw new Error(`Retrieve page for ${pageId} failed!`, {cause: responsePage});
                }

                //check level match
                const currentLevel = responsePage.properties["Level"].number;
                if (currentLevel !== Number(cells[1][0].text.content)) {
                    throw new Error(`Page ${pageId} is already reviewed!`);
                }

                //update last reviewed date and level
                const responseUpdate = await notion.pages.update({
                    page_id: pageId,
                    properties: {
                        "Last reviewed": {
                            date: {
                                start: responsePage.properties["Next reviewed date"].formula.date.start
                            }
                        },
                        "Level": {
                            number: cells[5][0].text.content.trim().toLowerCase() === "correct" ? Math.min(5, currentLevel + 1) : Math.max(0, currentLevel - 1)
                        }
                    }
                });

                //check valid response
                if (!responseUpdate.object || responseUpdate.object !== "page") {
                    throw new Error(`Update properties for ${pageId} failed!`, {cause: responseUpdate});
                }
            });

            //overall grade for the attempt

            //marked the attempt as reviewed
        });
    } catch (error) {
        throw new Error("Error while reassigning word levels", {cause: error});
    }
}

// Handler for review task
// export const handler = async(event) => {
    try {
        //TODO: Telegram alert
        const results = await getLastAttempts();
        if (results.length > 0)
            await reassignWordLevels(results);
        //TODO: Telegram alert
    } catch (error) {
        //TODO: Telegram alert
        console.log(error);
    }
// }

// Handler for generate task
// export const handler = async(event) => {
    // try {
    //     //TODO: Telegram alert
    //     const results = await getTodayWordList();
    //     if (results.length > 0)
    //         await createTodayAttempt(results);
    //     //TODO: Telegram alert
    // } catch (error) {
    //     //TODO: Telegram alert
    //     console.log(error);
    // }
// }