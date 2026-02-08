const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = 569502967; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// --- ЭКОНОМИКА (РАСЧЕТЫ ИЗ 0.5 TC ЗА КГ) ---
const ECO = {
    FISH_PRICE: 0.5,        // Цена за 1 кг
    REPAIR_COST: 5,         // Ремонт удочки (10 кг рыбы)
    UPGRADE_COST: 50,       // Улучшение (100 кг рыбы)
    MIN_WITHDRAW: 30000,    // Вывод от 30к TC (нужно выловить 60 тонн рыбы)
    DURABILITY_LOSS: 0.5    // Снятие прочности за один заброс
};

// --- СИСТЕМА БАЗЫ ДАННЫХ ---
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function writeDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) { console.error("Ошибка БД:", e); }
}

// --- ГЛАВНОЕ МЕНЮ ---
const mainMenu = (ctx) => {
    return ctx.reply('🌊 *TAMA FISHING WORLD* 🌊\n\nТвой путь к первому мотоциклу начинается здесь! 🏍️\nЛови рыбу, торгуй и развивайся.', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            [Markup.button.webApp('🎣 РЫБАЧИТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')],
            ['🎒 САДОК', '🛒 МАГАЗИН'],
            ['👥 РЕФЕРАЛЫ', 'ℹ️ ИНФО']
        ]).resize()
    });
};

// --- АДМИНКА (РЕЖИМ БОГА) ---
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('⚡ *ADMIN GOD MODE* ⚡\n\nВыбери инструмент управления:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Рассылка всем', 'adm_broadcast')],
            [Markup.button.callback('💰 Выдать TC себе', 'adm_add_me'), Markup.button.callback('📡 Выдать Эхолот', 'adm_sonar_me')],
            [Markup.button.callback('🚫 Бан / Разбан', 'adm_ban_panel'), Markup.button.callback('👤 Юзер по ID', 'adm_user_info')],
            [Markup.button.callback('📊 Статс', 'adm_stats')]
        ])
    });
});

// --- САДОК (СОСТОЯНИЕ ИГРОКА) ---
bot.hears('🎒 САДОК', (ctx) => {
    const db = readDB();
    const user = db[ctx.from.id] || { balance: 0, fish: 0, rod_durability: 100 };
    
    let status = user.rod_durability > 20 ? '✅ Исправна' : '⚠️ Требует ремонта';
    if (user.rod_durability <= 0) status = '❌ Сломана';

    const text = `👤 *ИГРОК:* ${ctx.from.first_name}\n` +
                 `🆔 *ID:* \`${ctx.from.id}\`\n` +
                 `──────────────────\n` +
                 `💰 *БАЛАНС:* ${user.balance.toFixed(2)} TC\n` +
                 `🐟 *РЫБА:* ${user.fish.toFixed(2)} кг\n` +
                 `🎣 *УДОЧКА:* ${user.rod_durability}% (${status})\n` +
                 `──────────────────\n` +
                 `📥 *ВЫВОД:* От ${ECO.MIN_WITHDRAW.toLocaleString()} TC`;

    ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 ЗАПРОС НА ВЫВОД', 'withdraw_req')],
            [Markup.button.callback(`🛠 РЕМОНТ (${ECO.REPAIR_COST} TC)`, 'repair_action')]
        ])
    });
});

// --- МАГАЗИН (2 ТИПА ТОВАРОВ) ---
bot.hears('🛒 МАГАЗИН', (ctx) => {
    ctx.reply('🛒 *РЫБОЛОВНЫЙ ПРИЛАВОК*\n\n🔹 *ЗА ВАЛЮТУ (TC):*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🪱 Приманка (1 TC)', 'buy_bait')],
            [Markup.button.callback(`📈 Улучшить удочку (${ECO.UPGRADE_COST} TC)`, 'upgrade_rod')],
            [Markup.button.url('📡 Эхолот (0.5 USDT)', 'https://t.me/send?start=IV123')], // Пример оплаты
            [Markup.button.url('🌊 Озеро Надежды (1 USDT)', 'https://t.me/send?start=IV456')]
        ])
    });
});

// --- РЕФЕРАЛКА (КОРОБКИ УДАЧИ) ---
bot.hears('👥 РЕФЕРАЛЫ', (ctx) => {
    const db = readDB();
    const user = db[ctx.from.id] || { boxes: 0 };
    const refLink = `https://t.me/твой_бот_username?start=${ctx.from.id}`;

    ctx.reply(`👥 *РЕФЕРАЛЬНАЯ ПРОГРАММА*\n\nЗа каждого друга — *3 Коробки Удачи* 🎁\n\n` +
              `⚠️ *Условие:* Друг должен выловить 5 кг рыбы.\n\n` +
              `🔗 Твоя ссылка:\n\`${refLink}\`\n\n` +
              `📦 Доступно коробок: *${user.boxes || 0}*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎁 ОТКРЫТЬ КОРОБКУ', 'open_luck_box')]
        ])
    });
});

// --- ИНФО ---
bot.hears('ℹ️ ИНФО', (ctx) => {
    ctx.reply(`ℹ️ *СПРАВКА ПО ПРОЕКТУ*\n\n` +
              `💸 *Экономика:* 1 кг = ${ECO.FISH_PRICE} TC.\n` +
              `🎣 *Износ:* Удочка понемногу тупится при каждом забросе.\n` +
              `💳 *Выплаты:* От ${ECO.MIN_WITHDRAW} TC на TON/USDT.\n\n` +
              `*Весь TC обеспечен оборотом внутри игры. Стейкайте, ловите, побеждайте!*`, { parse_mode: 'Markdown' });
});

// --- ЛОГИКА СТАРТА ---
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
            isBanned: false,
            inventory: []
        };
        writeDB(db);
        if (refId && refId != userId) {
            bot.telegram.sendMessage(refId, "📢 У вас новый реферал! Ожидайте выполнения условий (5 кг рыбы).");
        }
    }
    mainMenu(ctx);
});

// --- СЕРВЕР ДЛЯ WEB APP (API) ---
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

                if (!id || !db[id] || db[id].isBanned) return;

                if (data.action === 'catch_fish') {
                    if (db[id].rod_durability <= 0) {
                        await bot.telegram.sendMessage(id, "🪫 Удочка сломана! Почини её в Садке.");
                        return;
                    }
                    
                    const weight = parseFloat((Math.random() * 1.8 + 0.1).toFixed(2));
                    db[id].fish += weight;
                    db[id].rod_durability -= ECO.DURABILITY_LOSS;

                    // Реферальная проверка
                    if (db[id].referredBy && !db[id].refCompleted && db[id].fish >= 5) {
                        const rId = db[id].referredBy;
                        if (db[rId]) {
                            db[rId].boxes += 3;
                            db[id].refCompleted = true;
                            bot.telegram.sendMessage(rId, "🎁 Реферал выловил 5 кг! Вам начислено 3 Коробки Удачи!");
                        }
                    }
                    writeDB(db);
                }

                if (data.action === 'sell_fish') {
                    const gain = db[id].fish * ECO.FISH_PRICE;
                    db[id].balance += gain;
                    db[id].fish = 0;
                    writeDB(db);
                    await bot.telegram.sendMessage(id, `💰 Рыба продана за ${gain.toFixed(2)} TC!`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', balance: db[id].balance }));
            } catch (e) { res.writeHead(400); res.end(); }
        });
    } else {
        res.writeHead(200); res.end('Tama Engine Active');
    }
});

// --- CALLBACK ОБРАБОТЧИКИ (АДМИНКА И КНОПКИ) ---
bot.on('callback_query', async (ctx) => {
    const db = readDB();
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;

    // Ремонт
    if (data === 'repair_action') {
        if (db[userId].balance < ECO.REPAIR_COST) return ctx.answerCbQuery('❌ Недостаточно TC');
        db[userId].balance -= ECO.REPAIR_COST;
        db[userId].rod_durability = 100;
        writeDB(db);
        ctx.editMessageText('✅ Удочка полностью восстановлена!');
    }

    // Вывод
    if (data === 'withdraw_req') {
        if (db[userId].balance < ECO.MIN_WITHDRAW) return ctx.answerCbQuery(`❌ Минимум ${ECO.MIN_WITHDRAW} TC`);
        // Уведомление админу
        bot.telegram.sendMessage(ADMIN_ID, `💳 *ЗАПРОС НА ВЫВОД*\nЮзер: ${ctx.from.first_name} (\`${userId}\`)\nСумма: ${db[userId].balance} TC`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ ОПЛАЧЕНО', `pay_done_${userId}`)]
            ])
        });
        ctx.answerCbQuery('✅ Запрос отправлен админу!');
    }

    // Админская кнопка оплаты
    if (data.startsWith('pay_done_') && userId === ADMIN_ID) {
        const targetId = data.split('_')[2];
        bot.telegram.sendMessage(targetId, '💎 *ВЫПЛАТА ПОДТВЕРЖДЕНА!*\nСредства отправлены на ваш кошелек. Спасибо за игру!', { parse_mode: 'Markdown' });
        ctx.answerCbQuery('Уведомление отправлено!');
    }

    // Режим Бога: Статистика
    if (data === 'adm_stats' && userId === ADMIN_ID) {
        const users = Object.values(db);
        const totalBal = users.reduce((a, b) => a + b.balance, 0);
        ctx.reply(`📊 *ОТЧЕТ ПРОЕКТА:*\n\nИгроков: ${users.length}\nВсего TC: ${totalBal.toFixed(2)}`);
    }

    ctx.answerCbQuery();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Tama Server Live'));
bot.launch();
