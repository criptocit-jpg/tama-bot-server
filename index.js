const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = 569502967; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);
const ECO = { FISH_PRICE: 0.5, REPAIR_COST: 5, MIN_WITHDRAW: 30000 };

// Безопасное чтение БД
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

// Безопасная запись БД
function writeDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) { console.error("Ошибка записи БД:", e); }
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    // GET: Отдаем данные юзера
    if (parsedUrl.pathname === '/api/action' && req.method === 'GET') {
        const userId = parsedUrl.query.userId;
        if (userId && db[userId]) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(db[userId]));
        } else if (userId && !db[userId]) {
            // Если юзера нет в базе (зашел сразу в WebApp), создаем его
            db[userId] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
            writeDB(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(db[userId]));
        }
        res.writeHead(404); return res.end();
    }

    // POST: Действия
    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const id = data.userId;
                if (!id) return;
                
                // Инициализация если юзера нет
                if (!db[id]) {
                    db[id] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
                }

                if (data.action === 'catch_fish') {
                    if (db[id].rod_durability > 0) {
                        const weight = parseFloat((Math.random() * 2.0 + 0.1).toFixed(2));
                        db[id].fish = parseFloat((db[id].fish + weight).toFixed(2));
                        db[id].rod_durability -= 1;
                        writeDB(db);
                        // Отправляем уведомление, но не ждем его, чтобы не тормозить сервер
                        bot.telegram.sendMessage(id, `🎣 Ты поймал рыбу на ${weight} кг!`, { disable_notification: true }).catch(()=>{});
                    }
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((db[id].fish * ECO.FISH_PRICE).toFixed(2));
                    db[id].balance = parseFloat((db[id].balance + gain).toFixed(2));
                    db[id].fish = 0;
                    writeDB(db);
                }

                if (data.action === 'repair_rod') {
                    if (db[id].balance >= ECO.REPAIR_COST) {
                        db[id].balance = parseFloat((db[id].balance - ECO.REPAIR_COST).toFixed(2));
                        db[id].rod_durability = 100;
                        writeDB(db);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db[id]));
            } catch (e) { 
                console.error("Ошибка в POST обработке:", e);
                res.writeHead(400); res.end(); 
            }
        });
    }
});

// Слушаем порт правильно для Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});

bot.start((ctx) => {
    let db = readDB();
    if (!db[ctx.from.id]) {
        db[ctx.from.id] = { balance: 0, fish: 0, rod_durability: 100, boxes: 0, isBanned: false };
        writeDB(db);
    }
    ctx.reply('🌊 *ДОБРО ПОЖАЛОВАТЬ В TAMA FISHING!*\n\nЛови рыбу прямо в приложении, копи монеты и забирай призы! 🏍️', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[Markup.button.webApp('🎣 ОТКРЫТЬ МИР РЫБАЛКИ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()
    });
});

// Защита от падения при конфликтах или ошибках Telegram API
bot.catch((err) => {
    console.error('Ошибка Telegraf:', err);
});

bot.launch().then(() => console.log("✅ Бот запущен")).catch(e => console.error("Старт бота завален:", e));
