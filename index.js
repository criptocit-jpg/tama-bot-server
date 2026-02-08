const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// Чтение и запись БД
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) { return {}; }
}
function writeDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getUpdatedUser(db, uid, name = "Рыбак") {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, fish: 0, rod_durability: 100, level: 1, xp: 0, 
            energy: 15, lastRegen: Date.now(), name: name,
            titanLine: false, baitBoost: 1, wallet: null, banned: false, boxes: 0 
        };
    }
    const u = db[uid];
    if (u.banned) return u;
    const maxE = 15 + (u.level * 3);
    const now = Date.now();
    const gain = Math.floor((now - u.lastRegen) / 900000);
    if (gain > 0) { 
        u.energy = Math.min(maxE, u.energy + gain); 
        u.lastRegen = now; 
    }
    return u;
}

// Обработка /start
bot.start((ctx) => {
    const uid = String(ctx.from.id);
    const refId = ctx.payload; // ID пригласившего
    let db = readDB();
    const isNew = !db[uid];
    
    let u = getUpdatedUser(db, uid, ctx.from.first_name);

    if (isNew && refId && refId !== uid && db[refId]) {
        db[refId].boxes = (db[refId].boxes || 0) + 1;
        bot.telegram.sendMessage(refId, `📦 Вам начислен "Забытый ящик" за приглашение друга!`).catch(() => {});
    }
    
    writeDB(db);
    ctx.reply(`🎣 Привет, ${ctx.from.first_name}! Готов к большой рыбалке?`, 
        Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()
    );
});

// Админ-команды
bot.command('admin', (ctx) => {
    const uid = String(ctx.from.id);
    if (uid !== SUPER_ADMIN_ID && String(ctx.chat.id) !== ADMIN_GROUP_ID) return;
    
    const args = ctx.message.text.split(' ');
    const cmd = args[1];
    let db = readDB();

    if (cmd === 'list') {
        let list = "👤 **ИГРОКИ:**\n";
        Object.entries(db).slice(-10).forEach(([id, p]) => {
            list += `🔹 ${p.name} | ID: \`${id}\` | 💰 ${Math.floor(p.balance)}\n`;
        });
        ctx.reply(list, { parse_mode: 'Markdown' });
    }

    if (cmd === 'give' && args[2] && args[3]) {
        if (db[args[2]]) {
            db[args[2]].balance += parseFloat(args[3]);
            writeDB(db);
            ctx.reply("✅ Выдано!");
        }
    }
});

// Исправленный метод отправки счетов Stars
async function sendStarsInvoice(uid, itemId) {
    const shop = {
        'titan_line': { t: 'Титановая леска', d: 'Прочность -1 вместо -2', p: 50 },
        'gold_bait': { t: 'Золотая каша', d: '+50% к весу рыбы', p: 100 },
        'energy_pack': { t: 'Энергетик', d: '+30 энергии мгновенно', p: 30 }
    };
    const item = shop[itemId];
    if (!item) return;

    try {
        await bot.telegram.sendInvoice(uid, {
            title: item.t,
            description: item.d,
            payload: itemId,
            provider_token: "", 
            currency: "XTR",
            prices: [{ label: item.t, amount: item.p }]
        });
    } catch (e) {
        console.error("Ошибка выставления счета:", e);
    }
}

// HTTP Сервер
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    if (req.method === 'POST' && parsedUrl.pathname === '/api/action') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const uid = String(data.userId);
                let u = getUpdatedUser(db, uid, data.userName);
                if (u.banned) return res.end(JSON.stringify({ banned: true }));

                let msg = "";
                if (data.action === 'catch_fish') {
                    if (u.energy > 0 && u.rod_durability > 0) {
                        u.energy -= 1;
                        u.rod_durability -= (u.titanLine ? 1 : 2);
                        let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1) * (u.baitBoost || 1)).toFixed(2));
                        u.fish = parseFloat((u.fish + w).toFixed(2));
                        u.xp += 25;
                        msg = `Поймал: ${w}кг`;
                        if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 НОВЫЙ РАНГ!"; }
                    } else msg = "🔋 Нет энергии или сломана удочка!";
                }

                if (data.action === 'open_box' && u.boxes > 0) {
                    u.boxes -= 1;
                    const win = [5000, 10000, 15000, 25000, 50000][Math.floor(Math.random() * 5)];
                    u.balance += win;
                    msg = `🎁 В ящике было ${win} TC!`;
                }

                if (data.action === 'buy_stars') {
                    await sendStarsInvoice(uid, data.id);
                    msg = "💳 Счет отправлен!";
                }

                writeDB(db);
                res.end(JSON.stringify({ ...u, msg }));
            } catch (e) { res.end(JSON.stringify({ error: true })); }
        });
        return;
    }

    if (parsedUrl.pathname === '/api/action') {
        const u = getUpdatedUser(db, String(parsedUrl.query.userId));
        res.end(JSON.stringify(u));
    }
});

// Обработка платежей
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
    let db = readDB();
    const u = getUpdatedUser(db, String(ctx.from.id));
    const p = ctx.message.successful_payment.invoice_payload;
    if (p === 'titan_line') u.titanLine = true;
    if (p === 'gold_bait') u.baitBoost = 1.5;
    if (p === 'energy_pack') u.energy += 30;
    writeDB(db);
    ctx.reply('✅ Покупка активирована!');
});

// Запуск
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

bot.launch().then(() => console.log('Бот запущен!'));

// Остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
