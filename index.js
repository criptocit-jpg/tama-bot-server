const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '569502967'; // Твой ID для уведомлений о выводе
const DB_PATH = './database.json';
const bot = new Telegraf(BOT_TOKEN);

const ECO = { 
    FISH_PRICE: 0.1, REPAIR_COST: 10, BAIT_COST: 25,
    GOLDEN_HOUR: 19, MIN_WITHDRAW: 30000 
};

function readDB() { return fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : {}; }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getU(db, uid, name = "Рыбак") {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, fish: 0, rod_durability: 100, level: 1, xp: 0, 
            energy: 15, lastRegen: Date.now(), baits: 0, name: name,
            unlockedLocs: ['Заводь'], currentLoc: 'Заводь', referrals: 0
        };
    }
    const u = db[uid];
    const maxE = 15 + (u.level * 3);
    const gain = Math.floor((Date.now() - u.lastRegen) / 900000);
    if (gain > 0) { u.energy = Math.min(maxE, u.energy + gain); u.lastRegen = Date.now(); }
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
        const u = getU(db, String(parsedUrl.query.userId));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(u));
    }

    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            const data = JSON.parse(body);
            const uid = String(data.userId);
            let u = getU(db, uid);
            let msg = ""; let extra = {};

            if (data.action === 'catch_fish') {
                if (u.energy <= 0) msg = "🔋 Нет энергии!";
                else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                else {
                    u.energy -= 1; u.rod_durability -= 2;
                    if (u.rod_durability < 15 && Math.random() < 0.2) msg = "💥 ОБРЫВ ЛЕСКИ!";
                    else if (Math.random() < 0.005) { // Шанс 0.5% на Джекпот
                        const reward = Math.random() > 0.5 ? 50 : "LIC_SEA";
                        if (reward === 50) { u.balance += 50; msg = "🎁 ДЖЕКПОТ: 50 TC!"; }
                        else { u.unlockedLocs.push("Море"); msg = "🎁 ДЖЕКПОТ: Лицензия на Море!"; }
                    } else {
                        let w = parseFloat((Math.random() * 2 * (1 + u.level * 0.1)).toFixed(2));
                        if (new Date().getHours() === ECO.GOLDEN_HOUR) { w *= 2; msg = "🌟 КОСЯК! "; }
                        u.fish = parseFloat((u.fish + w).toFixed(2));
                        u.xp += 20; msg += `Поймал: ${w}кг`;
                        if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; }
                    }
                }
            }

            if (data.action === 'withdraw') {
                if (u.balance < ECO.MIN_WITHDRAW) msg = "❌ Недостаточно средств";
                else {
                    bot.telegram.sendMessage(ADMIN_ID, `💰 ЗАЯВКА НА ВЫВОД\nID: ${uid}\nКошелек: ${data.wallet}\nСумма: ${data.amount} TC`, 
                    Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]]));
                    msg = "✅ Заявка отправлена админу!";
                }
            }

            writeDB(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ...u, msg }));
        });
    }
});

bot.action(/pay_(.+)_(.+)/, (ctx) => {
    const [_, uid, amount] = ctx.match;
    bot.telegram.sendMessage(uid, `🎉 Выплата ${amount} TC успешно произведена!`).catch(()=>{});
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n✅ ВЫПОЛНЕНО");
});

server.listen(process.env.PORT || 10000);
bot.launch();
