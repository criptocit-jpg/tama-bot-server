const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// База данных
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8') || '{}');
    } catch (e) { return {}; }
}
function writeDB(db) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) {}
}

function getUpdatedUser(db, uid, name = "Рыбак") {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, fish: 0, rod_durability: 100, level: 1, xp: 0, 
            energy: 15, lastRegen: Date.now(), name: name || "Рыбак",
            titanLine: false, baitBoost: 1, wallet: null, banned: false, boxes: 0 
        };
    }
    const u = db[uid];
    const maxE = 15 + (u.level * 3);
    const now = Date.now();
    const gain = Math.floor((now - u.lastRegen) / 900000);
    if (gain > 0) { u.energy = Math.min(maxE, u.energy + gain); u.lastRegen = now; }
    return u;
}

bot.start(async (ctx) => {
    const uid = String(ctx.from.id);
    const refId = ctx.startPayload;
    let db = readDB();
    const isNew = !db[uid];
    getUpdatedUser(db, uid, ctx.from.first_name);
    if (isNew && refId && refId !== uid && db[refId]) {
        db[refId].boxes = (db[refId].boxes || 0) + 1;
        bot.telegram.sendMessage(refId, `📦 Новый ящик за друга!`).catch(() => {});
    }
    writeDB(db);
    ctx.reply(`🎣 Игра готова!`, Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

// API СЕРВЕР
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/api/action') {
        let db = readDB();
        if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                const data = JSON.parse(body);
                let u = getUpdatedUser(db, String(data.userId), data.userName);
                let msg = "";
                if (data.action === 'catch_fish' && u.energy > 0) {
                    u.energy--; u.rod_durability -= 2;
                    let w = parseFloat((Math.random() * 1.5).toFixed(2));
                    u.fish += w; u.xp += 25; msg = `Поймал ${w}кг`;
                }
                if (data.action === 'open_box' && u.boxes > 0) {
                    u.boxes--; u.balance += 15000; msg = "🎁 Найдено 15,000 TC!";
                }
                if (data.action === 'sell_fish') {
                    let g = parseFloat((u.fish * 0.5).toFixed(2));
                    u.balance += g; u.fish = 0; msg = `Продано на ${g} TC`;
                }
                writeDB(db);
                res.end(JSON.stringify({ ...u, msg }));
            });
        } else {
            const u = getUpdatedUser(db, String(parsedUrl.query.userId));
            const top = Object.values(db).slice(0,10).map(i=>({n:i.name, b:i.balance}));
            res.end(JSON.stringify({ ...u, top }));
        }
    } else {
        res.end("OK");
    }
});

// ЗАПУСК С ОЧИСТКОЙ КОНФЛИКТОВ
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`API на порту ${PORT}`));

async function startup() {
    try {
        console.log("Сброс старых соединений...");
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        await bot.launch();
        console.log("✅ БОТ ЗАПУЩЕН!");
    } catch (e) {
        if (e.response && e.response.error_code === 409) {
            console.log("Конфликт 409! Перезапуск через 5 сек...");
            setTimeout(startup, 5000);
        } else {
            console.error("Ошибка:", e);
        }
    }
}

startup();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
