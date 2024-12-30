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
        // const url = process.env.TELEGRAM_URL.replace("{{message}}", encodeURIComponent(message));
        const url = process.env.TELEGRAM_URL.replace("{{message}}", message);
        await axios.get(url);
    } catch(error) {
        console.error("Error sending telegram message:", error);
    }
}

/**
 * Get all the routines that is due today based on following properties:
 * 1. Last due date
 * 2. Repeat every # days (frequency)
 * 3. Days of week (MON, TUE, WED, THU, FRI, SAT, SUN)
 * TODO: Account for holidays
 */
const getDueRoutines = async() => {
    try {
        //get all active routines
        const response = await notion.databases.query({
            database_id: process.env.NOTION_ROUTINE_LIST_DATABASE_ID,
            filter: {
                property: 'Active',
                checkbox: {
                    equals: true
                }
            }
        });

        if (!response.object || response.object !== 'list') {
            throw new Error("Query routines failed!", {cause: response});
        }

        return response.results.filter(routine => {
            const lastDueDate = routine.properties['Last due date'].formula.date.start;
            const frequency = routine.properties['Repeat every # days'].number;
            const daysOfWeek = routine.properties['Days of week'].multi_select.map(day => day.name);
            
            //get day of week of last due date
            const lastDueDayOfWeek = moment(lastDueDate).format('ddd').toUpperCase();
            const nextDueDayOfWeek = daysOfWeek[(daysOfWeek.indexOf(lastDueDayOfWeek) + frequency) % daysOfWeek.length];

            return nextDueDayOfWeek === moment().tz('Asia/Bangkok').format('ddd').toUpperCase();
        });
    } catch(error) {
        throw new Error("Error getting due routines", {cause: error});
    }
}

/**
 * Create today's report in report database
 * 1. Set title "Name" to "{date}'s report"
 * 2. Set "Date" to today's date
 */
const createTodayReport = async() => {
    try {
        const response = await notion.pages.create({
            parent: {
                database_id: process.env.NOTION_REPORTS_DATABASE_ID
            },
            properties: {
                'Name': {
                    title: [
                        {
                            text: {
                                content: `${todayDate} report`
                            }
                        }
                    ]
                },
                'Date': {
                    date: {
                        start: todayDate
                    }
                }
            }
        });

        if (!response.object || response.object !== 'page') {
            throw new Error("Create report failed!", {cause: response});
        }

        return response;
    } catch(error) {
        throw new Error("Error creating today's report", {cause: error});
    }
}

/**
 * Create a record in records database for each routine with following properties:
 * 1. Set title "Name" to "{routine name} | {date}"
 * 2. Set "Routine" to the routine
 * 3. Set "Report" to today's report
 * 4. Set "Requirment" to the routine's requirement
 * 5. Set "Reminder" based on today's date and routine's "Remind hour" and "Remind minute"
 * @param {*} routines 
 * @param {*} report 
 */
const createTodayChecklist = async(routines, report) => {
    try {
        await Promise.all(
            routines.map(async(routine) => {
                const response = await notion.pages.create({
                    parent: {
                        database_id: process.env.NOTION_RECORD_LIST_DATABASE_ID
                    },
                    properties: {
                        'Name': {
                            title: [
                                {
                                    text: {
                                        content: `${routine.properties.Name.title[0].text.content} | ${todayDate}`
                                    }
                                }
                            ]
                        },
                        'Routine': {
                            relation: [
                                {
                                    id: routine.id
                                }
                            ]
                        },
                        'Report': {
                            relation: [
                                {
                                    id: report.id
                                }
                            ]
                        },
                        'Requirement': {
                            number: routine.properties["Requirement"].number
                        },
                        'Reminder': {
                            date: {
                                start: moment().set({
                                    hour: routine.properties["Remind hour"].number,
                                    minute: routine.properties["Remind minute"].number,
                                    second: 0,
                                    millisecond: 0
                                }).format('YYYY-MM-DDTHH:mm[+07:00]')
                            }
                        }
                    }
                });

                if (!response.object || response.object !== 'page') {
                    throw new Error("Create record failed!", {cause: response});
                }
            })
        );
    } catch(error) {
        throw new Error("Error while create today's checklist", {cause: error});
    }
}

// Handler for generate routine
export const handler = async (event) => {
    try {
        await sendTelegramMessage("Start generate today's checklist");
        console.log("Start generate today's checklist");
        
        const routines = await getDueRoutines();
        await sendTelegramMessage(`Number of due routines today: ${routines.length}`);
        if (routines.length > 0)
            await createTodayChecklist(routines, await createTodayReport());
        
        await sendTelegramMessage("Finish generate today's checklist");
        console.log("Finish generate today's checklist");
    } catch (error) {
        await sendTelegramMessage("Error generate today's checklist");
        console.log(error);
    }
}