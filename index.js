const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// Работа с базой данных
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
    if (gain > 0) { 
        u.energy = Math.min(maxE, u.energy + gain); 
        u.lastRegen = now; 
    }
    return u;
}

// Команда Старт
bot.start(async (ctx) => {
    const uid = String(ctx.from.id);
    const refId = ctx.startPayload ? String(ctx.startPayload) : null;
    let db = readDB();
    const isNew = !db[uid];
    getUpdatedUser(db, uid, ctx.from.first_name);

    if (isNew && refId && refId !== uid && db[refId]) {
        db[refId].boxes = (db[refId].boxes || 0) + 1;
        bot.telegram.sendMessage(refId, `📦 У вас новый сундук за друга!`).catch(() => {});
    }
    writeDB(db);
    ctx.reply(`🎣 Привет! Жми кнопку "ИГРАТЬ"`, 
        Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()
    );
});

// HTTP СЕРВЕР ДЛЯ WEBAPP
const server = http.createServer((req, res) => {
    // Настройка CORS для доступа из браузера
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    if (parsedUrl.pathname === '/api/action') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const uid = String(data.userId);
                    console.log(`Action: ${data.action} from user: ${uid}`); // ЛОГ ДЛЯ ПРОВЕРКИ
                    
                    let u = getUpdatedUser(db, uid, data.userName);
                    if (u.banned) return res.end(JSON.stringify({ banned: true }));

                    let msg = "";
                    if (data.action === 'catch_fish' && u.energy > 0 && u.rod_durability > 0) {
                        u.energy -= 1;
                        u.rod_durability -= (u.titanLine ? 1 : 2);
                        let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1) * (u.baitBoost || 1)).toFixed(2));
                        u.fish = parseFloat((u.fish + w).toFixed(2));
                        u.xp += 25;
                        msg = `Улов: ${w}кг`;
                        if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 УРОВЕНЬ ПОВЫШЕН!"; }
                    }

                    if (data.action === 'open_box' && u.boxes > 0) {
                        u.boxes -= 1;
                        const win = [5000, 10000, 15000, 25000, 50000][Math.floor(Math.random() * 5)];
                        u.balance += win;
                        msg = `🎁 Найдено ${win} TC!`;
                    }

                    if (data.action === 'sell_fish') {
                        const gain = parseFloat((u.fish * 0.5).toFixed(2));
                        u.balance = parseFloat((u.balance + gain).toFixed(2));
                        u.fish = 0;
                        msg = `Продано на ${gain} TC`;
                    }

                    writeDB(db);
                    res.end(JSON.stringify({ ...u, msg }));
                } catch (e) {
                    console.error("Server Logic Error:", e);
                    res.end(JSON.stringify({ error: true }));
                }
            });
        } else {
            // GET запрос для загрузки данных
            const uid = String(parsedUrl.query.userId);
            const u = getUpdatedUser(db, uid);
            const top = Object.values(db).filter(i=>!i.banned).sort((a,b)=>b.balance-a.balance).slice(0,10).map(i=>({n:i.name, b:i.balance}));
            res.end(JSON.stringify({ ...u, top }));
        }
    } else {
        // Для Render, чтобы он видел, что сервис живой
        res.writeHead(200);
        res.end("OK");
    }
});

// Запуск
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});

bot.launch().then(() => console.log("✅ БОТ РАБОТАЕТ"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
