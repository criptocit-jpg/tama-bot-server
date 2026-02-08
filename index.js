const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = 569502967; // ЗАМЕНИ НА СВОЙ ID
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// --- Инициализация БД ---
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function writeDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// --- Главное меню ---
const mainMenu = (ctx) => {
    return ctx.reply('🌊 *TAMA FISHING WORLD*\n\nДобро пожаловать на берег, рыбак! Выбери действие:', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            [Markup.button.webApp('🎣 ОТПРАВИТЬСЯ НА РЫБАЛКУ', 'https://criptocit-jpg.github.io/tama-fishing/')],
            ['🎒 САДОК', '🛒 МАГАЗИН'],
            ['👥 РЕФЕРАЛЫ', 'ℹ️ ИНФО']
        ]).resize()
    });
};

// --- Админ-панель (Режим Бога) ---
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('🔧 *ПАНЕЛЬ АДМИНИСТРАТОРА*\nВыбери инструмент управления:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Рассылка всем', 'admin_broadcast'), Markup.button.callback('👤 Юзер по ID', 'admin_user_manage')],
            [Markup.button.callback('💰 Выдать монеты', 'admin_give_coins'), Markup.button.callback('🛰 Выдать эхолот', 'admin_give_sonar')],
            [Markup.button.callback('🚫 Бан / Разбан', 'admin_ban_user')]
        ])
    });
});

// --- Садок (Профиль игрока) ---
bot.hears('🎒 САДОК', (ctx) => {
    const db = readDB();
    const user = db[ctx.from.id] || { balance: 0, fish: 0, rod_durability: 100, level: 1 };
    
    let text = `👤 *ПРОФИЛЬ: ${ctx.from.first_name}* \`(${ctx.from.id})\`\n`;
    text += `──────────────────\n`;
    text += `💰 Баланс: *${user.balance.toLocaleString()} TC*\n`;
    text += `🐟 Рыбы в садке: *${user.fish} кг*\n`;
    text += `🎣 Удочка: *${user.rod_durability}%* ${user.rod_durability < 20 ? '⚠️' : '✅'}\n`;
    text += `──────────────────\n`;
    text += `📍 Минимум на вывод: *30,000 TC*`;

    ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 ВЫВЕСТИ СРЕДСТВА', 'withdraw_request')],
            [Markup.button.callback('🛠 РЕМОНТ УДОЧКИ', 'repair_rod')]
        ])
    });
});

// --- Магазин ---
bot.hears('🛒 МАГАЗИН', (ctx) => {
    ctx.reply('🏪 *МАГАЗИН СНАСТЕЙ*\n\n🔹 *ТОВАРЫ ЗА TC:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🪱 Приманка (50 TC)', 'buy_bait')],
            [Markup.button.callback('📈 Улучшить удочку (500 TC)', 'upgrade_rod')],
            [Markup.button.url('🛰 Эхолот (0.5 USDT)', 'https://t.me/send?start=...')], // Пример оплаты через CryptoBot
            [Markup.button.url('🏝 Локация "Озеро Надежды" (1 USDT)', 'https://t.me/send?start=...')]
        ])
    });
});

// --- Реферальная система ---
bot.hears('👥 РЕФЕРАЛЫ', (ctx) => {
    const refLink = `https://t.me/твой_бот?start=${ctx.from.id}`;
    ctx.reply(`🤝 *РЕФЕРАЛЬНАЯ ПРОГРАММА*\n\nПриглашай друзей и получай *Коробки Удачи*! 🎁\n\n⚠️ *Условие:* Друг должен поймать минимум 5 кг рыбы.\n\n🔗 Твоя ссылка:\n\`${refLink}\``, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎁 Мои коробки (0 шт)', 'open_box')]
        ])
    });
});

// --- Инфо ---
bot.hears('ℹ️ ИНФО', (ctx) => {
    ctx.reply(`📖 *ИНФОРМАЦИЯ О ПРОЕКТЕ*\n\n` +
    `🐟 *Цены:* 1 кг рыбы = 0.1 TC\n` +
    `💳 *Вывод:* От 30,000 TC на кошелек TON\n` +
    `🛠 *Снасти:* Не забывай чинить удочку, иначе улов будет падать!\n\n` +
    `Удачной рыбалки в мире Tamacoin!`, { parse_mode: 'Markdown' });
});

// --- Логика рефералов (старт) ---
bot.start((ctx) => {
    const db = readDB();
    const referrerId = ctx.startPayload;
    
    if (!db[ctx.from.id]) {
        db[ctx.from.id] = { 
            balance: 0, 
            fish: 0, 
            rod_durability: 100, 
            referredBy: referrerId || null,
            boxes: 0,
            isBanned: false
        };
        writeDB(db);
    }
    mainMenu(ctx);
});

// Запуск
bot.launch();
