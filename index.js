const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = 569502967; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// Экономика 0.5 TC
const ECO = { FISH_PRICE: 0.5, REPAIR_COST: 5, MIN_WITHDRAW: 30000 };

function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function writeDB(db) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) {}
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    const db = readDB();

    // GET запрос: Приложение запрашивает данные юзера
    if (parsedUrl.pathname === '/api/action' && req.method === 'GET') {
        const userId = parsedUrl.query.userId;
        if (userId && db[userId]) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(db[userId]));
        }
        res.writeHead(404); return res.end();
    }

    // POST запрос: Действия (Ловля, Продажа, Ремонт)
    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const id = data.userId;
                if (!id || !db[id]) return;

                if (data.action === 'catch_fish') {
                    if (db[id].rod_durability <= 0) return;
                    const weight = parseFloat((Math.random() * 2.0 + 0.1).toFixed(2));
                    db[id].fish = parseFloat((db[id].fish + weight).toFixed(2));
                    db[id].rod_durability -= 1;
                    writeDB(db);
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((db[id].fish * ECO.FISH_PRICE).toFixed(2));
                    db[id].balance = parseFloat((db[id].balance + gain).toFixed(2));
                    db[id].fish = 0;
                    writeDB(db);
                }

                if (data.action === 'repair_rod') {
                    if (db[id].balance >= ECO.REPAIR_COST) {
                        db[id].balance -= ECO.REPAIR_COST;
                        db[id].rod_durability = 100;
                        writeDB(db);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db[id]));
            } catch (e) { res.writeHead(400); res.end(); }
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running'));

bot.start((ctx) => {
    const db = readDB();
    if (!db[ctx.from.id]) {
        db[ctx.from.id] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
        writeDB(db);
    }
    ctx.reply('🌊 ТАМАКОИН РЫБАЛКА\n\nВсе управление теперь внутри приложения!', 
        Markup.keyboard([[Markup.button.webApp('🎣 ОТКРЫТЬ МИР РЫБАЛКИ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()
    );
});

bot.launch();
