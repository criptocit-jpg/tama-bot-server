const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const DB_PATH = './database.json';
const bot = new Telegraf(BOT_TOKEN);
const ECO = { FISH_PRICE: 0.5, REPAIR_COST: 5 };

function readDB() {
    try { return fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : {}; }
    catch (e) { return {}; }
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

    if (parsedUrl.pathname === '/api/action' && req.method === 'GET') {
        const uid = String(parsedUrl.query.userId);
        if (uid && uid !== "undefined") {
            if (!db[uid]) db[uid] = { balance: 0, fish: 0, rod_durability: 100 };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(db[uid]));
        }
    }

    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const uid = String(data.userId);
                let resultMessage = "";
                
                if (!db[uid]) db[uid] = { balance: 0, fish: 0, rod_durability: 100 };

                if (data.action === 'catch_fish' && db[uid].rod_durability > 0) {
                    const w = parseFloat((Math.random() * 1.5 + 0.1).toFixed(2));
                    db[uid].fish = parseFloat((Number(db[uid].fish) + w).toFixed(2));
                    db[uid].rod_durability -= 1;
                    resultMessage = `Вы поймали рыбу: ${w} кг!`;
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((Number(db[uid].fish) * ECO.FISH_PRICE).toFixed(2));
                    db[uid].balance = parseFloat((Number(db[uid].balance) + gain).toFixed(2));
                    resultMessage = `Продано на сумму: ${gain} TC!`;
                    db[uid].fish = 0;
                }

                if (data.action === 'repair_rod' && Number(db[uid].balance) >= ECO.REPAIR_COST) {
                    db[uid].balance = parseFloat((db[uid].balance - ECO.REPAIR_COST).toFixed(2));
                    db[uid].rod_durability = 100;
                    resultMessage = "Удочка починена!";
                }

                writeDB(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                // Возвращаем данные игрока + текст уведомления
                res.end(JSON.stringify({ ...db[uid], msg: resultMessage }));
            } catch (e) { res.writeHead(400); res.end(); }
        });
        return;
    }
    res.writeHead(200); res.end("OK");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));

bot.start(ctx => {
    ctx.reply('🎣 ТАМАКОИН РЫБАЛКА\nВсе уведомления теперь внутри приложения!', 
    Markup.keyboard([[Markup.button.webApp('🎣 ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

bot.telegram.deleteWebhook({ drop_pending_updates: true }).then(() => bot.launch());
