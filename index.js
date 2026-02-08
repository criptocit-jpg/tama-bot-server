const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; // ТВОЯ ГРУППА
const DB_PATH = './database.json';

const ECO = { 
    FISH_PRICE: 0.5, 
    REPAIR_COST: 10, 
    REGEN_TIME: 900000,
    MIN_WITHDRAW: 30000 
};

const bot = new Telegraf(BOT_TOKEN);

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

function getUpdatedUser(db, uid, name = "Рыбак") {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, fish: 0, rod_durability: 100, level: 1, xp: 0, 
            energy: 15, lastRegen: Date.now(), name: name
        };
    }
    const u = db[uid];
    const maxE = 15 + (u.level * 3);
    const now = Date.now();
    const passed = now - (u.lastRegen || now);
    const gain = Math.floor(passed / ECO.REGEN_TIME);
    if (gain > 0) {
        u.energy = Math.min(maxE, (u.energy || 0) + gain);
        u.lastRegen = now;
    }
    return u;
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
            const u = getUpdatedUser(db, uid);
            const top = Object.values(db)
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 10)
                .map(i => ({n: i.name || "Рыбак", b: i.balance}));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ...u, top }));
        }
    }

    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const uid = String(data.userId);
                let u = getUpdatedUser(db, uid, data.userName);
                let msg = "";

                if (data.action === 'catch_fish') {
                    if (u.energy <= 0) msg = "🔋 Нет энергии!";
                    else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                    else {
                        u.energy -= 1; u.rod_durability -= 2;
                        let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1)).toFixed(2));
                        u.fish = parseFloat((u.fish + w).toFixed(2));
                        u.xp += 25; msg = `Поймал: ${w}кг`;
                        if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 НОВЫЙ РАНГ!"; }
                    }
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((u.fish * ECO.FISH_PRICE).toFixed(2));
                    u.balance = parseFloat((u.balance + gain).toFixed(2));
                    u.fish = 0; msg = `Продано на ${gain} TC`;
                }

                if (data.action === 'repair_rod' && u.balance >= ECO.REPAIR_COST) {
                    u.balance -= ECO.REPAIR_COST; u.rod_durability = 100; msg = "Удочка как новая!";
                }

                if (data.action === 'withdraw') {
                    if (u.balance >= data.amount && data.amount >= ECO.MIN_WITHDRAW) {
                        u.balance -= data.amount;
                        bot.telegram.sendMessage(ADMIN_GROUP_ID, `💰 ЗАЯВКА\nID: ${uid}\nИмя: ${u.name}\nКошелек: ${data.wallet}\nСумма: ${data.amount} TC`, 
                        Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]]));
                        msg = "📩 Заявка в группе админа!";
                    } else msg = "❌ Ошибка суммы!";
                }

                writeDB(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ...u, msg }));
            } catch (e) { res.writeHead(400); res.end(); }
        });
        return;
    }
    res.writeHead(200); res.end("OK");
});

bot.action(/pay_(.+)_(.+)/, (ctx) => {
    const [_, uid, amount] = ctx.match;
    bot.telegram.sendMessage(uid, `🎉 Выплата ${amount} TC успешно переведена!`).catch(e=>{});
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n✅ СТАТУС: ОПЛАЧЕНО");
});

bot.start(ctx => {
    ctx.reply('🎣 Добро пожаловать в Tama Fishing!', 
    Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

server.listen(process.env.PORT || 10000, '0.0.0.0');
bot.launch();
