const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');

// --- НАСТРОЙКИ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = 569502967; // Твой ID
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// --- РАБОТА С БАЗОЙ ДАННЫХ (БЕЗ СОКРАЩЕНИЙ) ---
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const initialData = {};
            fs.writeFileSync(DB_PATH, JSON.stringify(initialData));
            return initialData;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error("Ошибка чтения БД:", e);
        return {};
    }
}

function writeDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("Ошибка записи БД:", e);
    }
}

// --- ГЛАВНОЕ МЕНЮ (КРАСОЧНОЕ) ---
const showMainMenu = (ctx) => {
    return ctx.reply('🌊 *ДОБРО ПОЖАЛОВАТЬ В TAMA FISHING!* 🌊\n\nЗдесь ты можешь ловить рыбу, копить монеты и заработать на свой первый мотоцикл! 🏍️\n\nВыбери раздел меню ниже:', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            [Markup.button.webApp('🎣 ИГРАТЬ (WEB APP)', 'https://criptocit-jpg.github.io/tama-fishing/')],
            ['🎒 САДОК', '🛒 МАГАЗИН'],
            ['👥 РЕФЕРАЛЫ', 'ℹ️ ИНФО']
        ]).resize()
    });
};

// --- АДМИН-ПАНЕЛЬ (РЕЖИМ БОГА) ---
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ У вас нет прав доступа.');
    
    ctx.reply('🛠 *ПАНЕЛЬ АДМИНИСТРАТОРА (GOD MODE)*\n\nУправляйте проектом в одно нажатие:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Рассылка всем', 'admin_broadcast'), Markup.button.callback('👤 Юзер по ID', 'admin_find_user')],
            [Markup.button.callback('💰 Выдать TC', 'admin_give_money'), Markup.button.callback('📡 Выдать Эхолот', 'admin_give_sonar')],
            [Markup.button.callback('🚫 Бан / Разбан', 'admin_ban')],
            [Markup.button.callback('📊 Статистика проекта', 'admin_stats')]
        ])
    });
});

// --- САДОК (ПРОФИЛЬ ИГРОКА) ---
bot.hears('🎒 САДОК', (ctx) => {
    const db = readDB();
    const user = db[ctx.from.id];
    
    if (!user) return ctx.reply('❌ Сначала нажми /start');

    const text = `👤 *РЫБАК:* ${ctx.from.first_name}\n` +
                 `🆔 *ID:* \`${ctx.from.id}\`\n\n` +
                 `💰 *БАЛАНС:* ${user.balance.toLocaleString()} TC\n` +
                 `🐟 *В САДКЕ:* ${user.fish} кг\n` +
                 `🎣 *УДОЧКА:* ${user.rod_durability}% прочности\n\n` +
                 `💳 *ВЫВОД СРЕДСТВ:* От 30,000 TC`;

    ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💸 ВЫВЕСТИ TC', 'withdraw_req')],
            [Markup.button.callback('🔧 ПОЧИНИТЬ УДОЧКУ', 'repair_rod')]
        ])
    });
});

// --- МАГАЗИН (ДВА ВИДА ТОВАРОВ) ---
bot.hears('🛒 МАГАЗИН', (ctx) => {
    ctx.reply('🛒 *РЫБОЛОВНЫЙ МАГАЗИН*\n\n🔹 *ЗА МОНЕТЫ (TC):*\n• Приманка, Ремонт, Улучшения\n\n🔸 *ЗА ТОН (USDT):*\n• Эхолоты, Новые локации', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🪱 Купить приманку', 'shop_bait'), Markup.button.callback('🛠 Ремонт (100 TC)', 'shop_repair')],
            [Markup.button.callback('⏫ Улучшить удочку', 'shop_upgrade')],
            [Markup.button.callback('📡 Эхолот (0.5 USDT)', 'shop_sonar_ton')],
            [Markup.button.callback('🏝 Озеро Надежды (1 USDT)', 'shop_loc_ton')]
        ])
    });
});

// --- РЕФЕРАЛКА (С ЗАЩИТОЙ ОТ БОТОВ) ---
bot.hears('👥 РЕФЕРАЛЫ', (ctx) => {
    const db = readDB();
    const user = db[ctx.from.id];
    const refLink = `https://t.me/твой_бот?start=${ctx.from.id}`;

    ctx.reply(`👥 *РЕФЕРАЛЬНАЯ СИСТЕМА*\n\nЗа каждого активного друга ты получаешь *3 Коробки Удачи*! 🎁\n\n⚠️ *Условие:* Друг должен поймать 5 кг рыбы.\n\n🔗 *Твоя ссылка:* \n\`${refLink}\`\n\n📦 Доступно коробок: *${user.boxes || 0}*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎁 ОТКРЫТЬ КОРОБКУ', 'open_box')]
        ])
    });
});

// --- ИНФО ---
bot.hears('ℹ️ ИНФО', (ctx) => {
    ctx.reply(`📖 *ИНФОРМАЦИЯ И ПРАВИЛА*\n\n` +
              `• 1 кг обычной рыбы = 100 TC\n` +
              `• Ремонт удочки необходим каждые 50 забросов.\n` +
              `• Вывод средств: на кошелек TON (USDT).\n` +
              `• Минимальный вывод: 30,000 TC.\n\n` +
              `*Средства крутятся внутри экосистемы и обеспечивают ликвидность проекта.*`, { parse_mode: 'Markdown' });
});

// --- ОБРАБОТКА СТАРТА И РЕФЕРАЛОВ ---
bot.start((ctx) => {
    const db = readDB();
    const userId = ctx.from.id;
    const refId = ctx.startPayload;

    if (!db[userId]) {
        db[userId] = {
            balance: 0,
            fish: 0,
            rod_durability: 100,
            boxes: 0,
            referredBy: (refId && refId != userId) ? refId : null,
            refCompleted: false,
            isBanned: false
        };
        writeDB(db);
        
        if (refId && refId != userId) {
            bot.telegram.sendMessage(refId, "🔔 У вас новый реферал! Коробки удачи придут, когда он поймает 5 кг рыбы.");
        }
    }
    showMainMenu(ctx);
});

// --- API СЕРВЕР ДЛЯ WEB APP (БЕЗ СОКРАЩЕНИЙ) ---
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const db = readDB();
                const id = data.userId;

                if (!id || !db[id]) return;
                if (db[id].isBanned) return;

                if (data.action === 'catch_fish') {
                    // Логика экономики: шанс и износ
                    if (db[id].rod_durability <= 0) {
                        await bot.telegram.sendMessage(id, "⚠️ Твоя удочка сломана! Почини её в Садке.");
                        return;
                    }

                    const weight = parseFloat((Math.random() * 2.5 + 0.1).toFixed(2));
                    db[id].fish = parseFloat((db[id].fish + weight).toFixed(2));
                    db[id].rod_durability -= 1; // Износ

                    // Проверка реферального условия
                    if (db[id].referredBy && !db[id].refCompleted && db[id].fish >= 5) {
                        const refId = db[id].referredBy;
                        if (db[refId]) {
                            db[refId].boxes += 3;
                            db[id].refCompleted = true;
                            bot.telegram.sendMessage(refId, "🎁 Твой друг поймал 5 кг! Тебе начислено 3 Коробки Удачи!");
                        }
                    }

                    writeDB(db);
                    await bot.telegram.sendMessage(id, `🎣 Ты поймал рыбу на ${weight} кг!`, { disable_notification: true });
                }

                if (data.action === 'sell_fish') {
                    const price = 100; // 100 TC за кг
                    const gain = Math.floor(db[id].fish * price);
                    db[id].balance += gain;
                    db[id].fish = 0;
                    writeDB(db);
                    await bot.telegram.sendMessage(id, `💰 Рыба продана за ${gain} TC!`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', balance: db[id].balance }));
            } catch (e) { res.writeHead(400); res.end(); }
        });
    } else {
        res.writeHead(200); res.end('Tama Server OK');
    }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));

bot.on('callback_query', async (ctx) => {
    const db = readDB();
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // Логика кнопок (Админка, Магазин и т.д.)
    if (data === 'withdraw_req') {
        if (db[userId].balance < 30000) return ctx.answerCbQuery('❌ Минималка 30,000 TC');
        ctx.reply('📝 Введите ваш адрес кошелька TON для вывода:');
        // Тут можно добавить стейт для приема адреса
    }

    if (data === 'repair_rod') {
        if (db[userId].balance < 100) return ctx.answerCbQuery('❌ Недостаточно монет');
        db[userId].balance -= 100;
        db[userId].rod_durability = 100;
        writeDB(db);
        ctx.editMessageText('✅ Удочка как новая!');
    }
    
    // Админские действия
    if (data === 'admin_stats' && userId === ADMIN_ID) {
        const totalUsers = Object.keys(db).length;
        ctx.reply(`📊 Игроков: ${totalUsers}\n💰 Всего в обороте: ${Object.values(db).reduce((a, b) => a + b.balance, 0)} TC`);
    }

    ctx.answerCbQuery();
});

bot.launch();
