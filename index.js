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
    try {
        const uid = String(ctx.from.id);
        const refId = ctx.startPayload;
        let db = readDB();
        const isNew = !db[uid];
        getUpdatedUser(db, uid, ctx.from.first_name);
        if (isNew && refId && refId !== uid && db[refId]) {
            db[refId].boxes = (db[refId].boxes || 0) + 1;
            bot.telegram.sendMessage(refId, `📦 Вам начислен ящик за друга!`).catch(() => {});
        }
        writeDB(db);
        ctx.reply(`🎣 Клев начался!`, Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
    } catch (e) { console.error("Start error", e); }
});

// HTTP Сервер для API
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    if (parsedUrl.pathname === '/api/action') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const uid = String(data.userId);
                    let u = getUpdatedUser(db, uid, data.userName);
                    let msg = "";

                    if (data.action === 'catch_fish' && u.energy > 0) {
                        u.energy--; u.rod_durability -= (u.titanLine ? 1 : 2);
                        let w = parseFloat((Math.random() * 1.5).toFixed(2));
                        u.fish = parseFloat((u.fish + w).toFixed(2)); u.xp += 25;
                        msg = `Улов: ${w}кг`;
                        if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 УРОВЕНЬ ПОВЫШЕН!"; }
                    } else if (data.action === 'sell_fish') {
                        let gain = parseFloat((u.fish * 0.5).toFixed(2));
                        u.balance = parseFloat((u.balance + gain).toFixed(2)); u.fish = 0;
                        msg = `Продано на ${gain} TC`;
                    } else if (data.action === 'open_box' && u.boxes > 0) {
                        u.boxes--;
                        const win = [5000, 10000, 20000, 50000][Math.floor(Math.random()*4)];
                        u.balance += win; msg = `🎁 Выпало ${win} TC!`;
                    }

                    writeDB(db);
                    res.end(JSON.stringify({ ...u, msg }));
                } catch(e) { res.end(JSON.stringify({error: true})); }
            });
        } else {
            const uid = String(parsedUrl.query.userId || "");
            const u = getUpdatedUser(db, uid);
            res.end(JSON.stringify(u));
        }
    } else {
        res.writeHead(200);
        res.end("OK");
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`API port: ${PORT}`));

// ФУНКЦИЯ БЕЗОПАСНОГО ЗАПУСКА
async function safeLaunch() {
    try {
        console.log("Очистка старых сессий...");
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        // Даем время старой копии завершиться
        setTimeout(async () => {
            try {
                await bot.launch();
                console.log("✅ БОТ УСПЕШНО ЗАПУЩЕН!");
            } catch (err) {
                if (err.response && err.response.error_code === 409) {
                    console.log("Конфликт всё еще есть, пробую снова...");
                    safeLaunch();
                }
            }
        }, 3000); 
    } catch (e) {
        console.error("Ошибка в safeLaunch:", e);
    }
}

safeLaunch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
