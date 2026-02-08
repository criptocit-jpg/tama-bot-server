const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const DB_PATH = './database.json';
const bot = new Telegraf(BOT_TOKEN);

const ECO = { FISH_PRICE: 0.5, REPAIR_COST: 5 };

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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    // GET /api/action?userId=...
    if (parsedUrl.pathname === '/api/action' && req.method === 'GET') {
        const uid = String(parsedUrl.query.userId);
        if (uid && uid !== "undefined") {
            if (!db[uid]) {
                db[uid] = { balance: 0, fish: 0, rod_durability: 100 };
                writeDB(db);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(db[uid]));
        }
    }

    // POST /api/action
    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const uid = String(data.userId);
                if (!db[uid]) db[uid] = { balance: 0, fish: 0, rod_durability: 100 };

                if (data.action === 'catch_fish' && db[uid].rod_durability > 0) {
                    const w = parseFloat((Math.random() * 1.5 + 0.1).toFixed(2));
                    db[uid].fish = parseFloat((Number(db[uid].fish) + w).toFixed(2));
                    db[uid].rod_durability -= 1;
                    bot.telegram.sendMessage(uid, `🎣 Поймал: ${w} кг!`).catch(()=>{});
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((Number(db[uid].fish) * ECO.FISH_PRICE).toFixed(2));
                    db[uid].balance = parseFloat((Number(db[uid].balance) + gain).toFixed(2));
                    db[uid].fish = 0;
                }

                if (data.action === 'repair_rod' && db[uid].balance >= ECO.REPAIR_COST) {
                    db[uid].balance -= ECO.REPAIR_COST;
                    db[uid].rod_durability = 100;
                }

                writeDB(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db[uid]));
            } catch (e) { res.writeHead(400); res.end(); }
        });
        return;
    }
    res.writeHead(200); res.end("OK");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));

bot.start(ctx => {
    ctx.reply('🌊 Рыбалка готова!', Markup.keyboard([[Markup.button.webApp('🎣 ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

// Убийца ошибки 409
bot.telegram.deleteWebhook({ drop_pending_updates: true }).then(() => {
    bot.launch();
});
