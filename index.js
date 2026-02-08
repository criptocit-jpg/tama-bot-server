const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

function readDB() { try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { return {}; } }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

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
    if (gain > 0) { u.energy = Math.min(maxE, u.energy + gain); u.lastRegen = now; }
    return u;
}

bot.start((ctx) => {
    const uid = String(ctx.from.id);
    const refId = ctx.payload;
    let db = readDB();
    const isNew = !db[uid];
    let u = getUpdatedUser(db, uid, ctx.from.first_name);

    if (isNew && refId && refId !== uid && db[refId]) {
        db[refId].boxes = (db[refId].boxes || 0) + 1; // Даем 1 сундук (в нем будет 3 коробки на выбор)
        bot.telegram.sendMessage(refId, `📦 Вам доставлен "Забытый ящик" за приглашение друга! Откройте его в игре.`);
    }
    writeDB(db);
    ctx.reply(`🎣 Удачного клева!`, Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

// ПАНЕЛЬ БОГА
bot.command('admin', (ctx) => {
    const uid = String(ctx.from.id);
    if (uid !== SUPER_ADMIN_ID && String(ctx.chat.id) !== ADMIN_GROUP_ID) return;
    const args = ctx.message.text.split(' ');
    const cmd = args[1];
    let db = readDB();

    if (cmd === 'givebox' && args[2]) {
        if (db[args[2]]) {
            db[args[2]].boxes = (db[args[2]].boxes || 0) + parseInt(args[3] || 1);
            writeDB(db);
            ctx.reply("📦 Коробки выданы!");
        }
    }
    // ... остальные команды (stats, list, ban) остаются как были
});

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
        req.on('end', () => {
            const data = JSON.parse(body);
            const uid = String(data.userId);
            let u = getUpdatedUser(db, uid, data.userName);
            if (u.banned) return res.end(JSON.stringify({ banned: true }));

            let msg = "";
            // ЛОГИКА ОТКРЫТИЯ КОРОБКИ
            if (data.action === 'open_box') {
                if (u.boxes > 0) {
                    u.boxes -= 1;
                    const rewards = [5000, 10000, 15000, 25000, 50000];
                    const win = rewards[Math.floor(Math.random() * rewards.length)];
                    u.balance += win;
                    msg = `🎁 Найдено: ${win} TC!`;
                } else msg = "📦 Нет доступных ящиков";
            }
            
            // ... (остальные действия catch_fish, sell_fish, buy_stars те же)
            
            writeDB(db);
            res.end(JSON.stringify({ ...u, msg }));
        });
        return;
    }

    if (parsedUrl.pathname === '/api/action') {
        const u = getUpdatedUser(db, String(parsedUrl.query.userId));
        const top = Object.values(db).filter(i=>!i.banned).sort((a,b)=>b.balance-a.balance).slice(0,10).map(i=>({n:i.name, b:i.balance}));
        res.end(JSON.stringify({ ...u, top }));
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => { /* логика Stars */ });
bot.action(/pay_(.+)_(.+)/, (ctx) => { /* логика выплат */ });

server.listen(process.env.PORT || 10000);
bot.launch();
