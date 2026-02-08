const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '569502967'; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);
const ECO = { FISH_PRICE: 0.5, REPAIR_COST: 5, MIN_WITHDRAW: 30000 };

// Читаем базу безопасно
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

// Пишем базу безопасно
function writeDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) { console.error("DB Write Error:", e); }
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    // GET запрос данных
    if (parsedUrl.pathname === '/api/action' && req.method === 'GET') {
        const userId = String(parsedUrl.query.userId); // Всегда в строку
        if (userId && userId !== "undefined") {
            if (!db[userId]) {
                db[userId] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
                writeDB(db);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(db[userId]));
        }
        res.writeHead(400); return res.end(JSON.stringify({error: "No ID"}));
    }

    // POST действия
    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const id = String(data.userId); // Всегда в строку
                
                if (!id || id === "undefined") throw new Error("Invalid User ID");

                if (!db[id]) {
                    db[id] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
                }

                if (data.action === 'catch_fish') {
                    if (db[id].rod_durability > 0) {
                        const weight = parseFloat((Math.random() * 2.0 + 0.1).toFixed(2));
                        db[id].fish = parseFloat((Number(db[id].fish) + weight).toFixed(2));
                        db[id].rod_durability = Number(db[id].rod_durability) - 1;
                        
                        // Отправляем сообщение без блокировки сервера
                        bot.telegram.sendMessage(id, `🎣 Улов: ${weight} кг!`).catch(() => {});
                    }
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((Number(db[id].fish) * ECO.FISH_PRICE).toFixed(2));
                    db[id].balance = parseFloat((Number(db[id].balance) + gain).toFixed(2));
                    db[id].fish = 0;
                }

                if (data.action === 'repair_rod') {
                    if (Number(db[id].balance) >= ECO.REPAIR_COST) {
                        db[id].balance = parseFloat((Number(db[id].balance) - ECO.REPAIR_COST).toFixed(2));
                        db[id].rod_durability = 100;
                    }
                }

                writeDB(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db[id]));

            } catch (e) {
                console.error("Critical API Error:", e.message);
                res.writeHead(500); res.end(JSON.stringify({error: e.message}));
            }
        });
    }
});

// Настройка порта для Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER LIVE ON PORT ${PORT}`);
});

bot.start((ctx) => {
    const id = String(ctx.from.id);
    let db = readDB();
    if (!db[id]) {
        db[id] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
        writeDB(db);
    }
    ctx.reply('🌊 *ДОБРО ПОЖАЛОВАТЬ В TAMA FISHING!*', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[Markup.button.webApp('🎣 ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()
    });
});

bot.catch((err) => console.error('Telegraf Error:', err));
bot.launch().then(() => console.log("✅ BOT STARTED")).catch(e => console.error("BOT FAIL:", e));
