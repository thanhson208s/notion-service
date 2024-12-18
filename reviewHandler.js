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
        await Promise.all(
            results.map(async(page) => {
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

                //update new level and last reviewed date for each word in the attempt
                let overallGrade = 0;
                await Promise.all(
                    rows.map(async(row) => {
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

                        //increase grade for correct answer
                        const isCorrect = cells[5][0].text.content.trim().toLowerCase() === "correct";
                        if (isCorrect)
                            overallGrade++;     

                        //check level match and not completed and not draft
                        const currentLevel = responsePage.properties["Level"].number;
                        const isCompleted = responsePage.properties["Completed"].checkbox;
                        const isDraft = responsePage.properties["Draft"].checkbox;
                        if (currentLevel !== Number(cells[1][0].text.content) || isCompleted || isDraft) {
                            return;
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
                                    number: isCorrect ? Math.min(5, currentLevel + 1) : Math.max(0, currentLevel - 1)
                                },
                                "Completed": {
                                    checkbox: currentLevel === 5 && isCorrect
                                }
                            }
                        });

                        //check valid response
                        if (!responseUpdate.object || responseUpdate.object !== "page") {
                            throw new Error(`Update properties for ${pageId} failed!`, {cause: responseUpdate});
                        }
                    })
                );

                //set overall grade for the attempt and marked the attemp as reviewed
                const responseGrade = await notion.pages.update({
                    page_id: page.id,
                    properties: {
                        "Grade": {
                            number: Math.round(overallGrade / rows.length * 100) / 100
                        },
                        "Reviewed": {
                            checkbox: true
                        }
                    }
                });

                //check valid response
                if (!responseGrade.object || responseGrade.object !== "page") {
                    throw new Error(`Update properties for ${page.id} failed!`, {cause: responseGrade});
                }
            })
        )
    } catch (error) {
        throw new Error("Error while reassigning word levels", {cause: error});
    }
}

// Handler for review task
export const handler = async(event) => {
    console.log(`Reviewing task triggered at: ${event.time}`);

    try {
        await sendTelegramMessage("Start review today's attempt");
        console.log("Start review today's attempt");
        const results = await getLastAttempts();
        await sendTelegramMessage(`Number of attempts to review today: ${results.length}`);
        console.log(`Number of attempts to review today: ${results.length}`);
        if (results.length > 0)
            await reassignWordLevels(results);
        await sendTelegramMessage("Finish review today's attempt");
        console.log("Finish review today's attempt");
    } catch (error) {
        await sendTelegramMessage("Error review today's attempt");
        console.error(error);
    }
}