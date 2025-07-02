require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { processChapter } = require('./scraper');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("CRITICAL: TELEGRAM_BOT_TOKEN not found in .env file.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Telegram Bot is running...');

// --- COMMAND: /start ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        "Welcome to the Manga Scraper Bot!\n\n" +
        "Use the `/sync` command to start a job.\n\n" +
        "*Format:*\n`/sync <url> <chapter_number> <Manga Title>`\n\n" +
        "*Example:*\n`/sync https://.../chapter-45/ 45 Legendary Surgeon`",
        { parse_mode: "Markdown" }
    );
});

// --- COMMAND: /sync ---
bot.onText(/\/sync (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
        const parts = match[1].split(' ');
        if (parts.length < 3) {
            bot.sendMessage(chatId, "❌ Invalid format. Please provide: URL, Chapter Number, and Manga Title.");
            return;
        }

        const chapterUrl = parts[0];
        const chapterNum = parts[1];
        const mangaTitle = parts.slice(2).join(' ');

        await bot.sendMessage(chatId, `✅ Job received!\n*Manga:* ${mangaTitle}\n*Chapter:* ${chapterNum}\n\nScraping now, please wait...`, { parse_mode: "Markdown" });

        // Call the scraper function and wait for its result
        const result = await processChapter(chapterUrl, mangaTitle, chapterNum);
        
        if (result.success) {
            bot.sendMessage(chatId, `🎉 *Sync Successful!* 🎉\n\n${result.message}`, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, `❌ *Sync Failed* ❌\n\nReason: ${result.message}`, { parse_mode: "Markdown" });
        }
    } catch (error) {
        console.error("A critical error occurred in the bot handler:", error);
        bot.sendMessage(chatId, `🚨 A critical bot error occurred. Check the server logs.\nError: ${error.message}`);
    }
});
