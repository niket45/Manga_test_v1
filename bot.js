require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { processChapter } = require('./syncChapter'); // Import our scraper logic

const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Telegram Bot is running...');

// --- COMMAND: /start ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        "Welcome to the Manga Scraper Bot!\n\n" +
        "Use the /sync command to start a job.\n\n" +
        "*Format:*\n`/sync <url> <chapter_number> <Manga Title With Spaces>`\n\n" +
        "*Example:*\n`/sync https://.../chapter-45/ 45 I Reincarnated As A Legendary Surgeon`",
        { parse_mode: "Markdown" }
    );
});

// --- COMMAND: /sync ---
bot.onText(/\/sync (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const parts = match[1].split(' ');
    
    if (parts.length < 3) {
        bot.sendMessage(chatId, "❌ Invalid format. Please provide: URL, Chapter Number, and Manga Title.");
        return;
    }

    const chapterUrl = parts[0];
    const chapterNum = parts[1];
    const mangaTitle = parts.slice(2).join(' '); // The rest is the title

    // Acknowledge the command immediately
    await bot.sendMessage(chatId, 
        `✅ Job received!\n\n` +
        `*Manga:* ${mangaTitle}\n` +
        `*Chapter:* ${chapterNum}\n\n` +
        `Scraping and uploading now. This might take a few minutes...`
    , { parse_mode: "Markdown" });

    try {
        // --- THIS IS THE MAGIC ---
        // Call the scraper function and wait for its result
        const result = await processChapter(chapterUrl, mangaTitle, chapterNum);
        
        // Report the final outcome
        if (result.success) {
            bot.sendMessage(chatId, 
                `🎉 *Sync Successful!* 🎉\n\n` +
                `${result.message}\n` +
                `You can verify the first image here: ${result.firstImageUrl}`
            , { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, `❌ *Sync Failed* ❌\n\n${result.message}`);
        }

    } catch (error) {
        console.error("A critical error occurred in the bot handler:", error);
        bot.sendMessage(chatId, `🚨 A critical error occurred. Please check the server logs.\nError: ${error.message}`);
    }
});
