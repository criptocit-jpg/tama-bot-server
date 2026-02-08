const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; 
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

function readDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { return {}; }
}
function writeDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getUpdatedUser(db, uid, name = "Рыбак") {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, fish: 0, rod_durability: 100, level: 1, xp: 0, 
            energy: 15, lastRegen: Date.now(), name: name,
            titanLine: false, baitBoost: 1, wallet: null, banned: false 
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

// ПЛАТЕЖИ STARS
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
    let db = readDB();
    const u = getUpdatedUser(db, String(ctx.from.id));
    const payload = ctx.message.successful_payment.invoice_payload;
    if (payload === 'titan_line') u.titanLine = true;
    if (payload === 'gold_bait') u.baitBoost = 1.5;
    if (payload === 'energy_pack') u.energy += 30;
    writeDB(db);
    ctx.reply('✅ Покупка прошла успешно! Улучшение активировано.');
});

// АДМИН КОМАНДЫ
bot.command('admin', (ctx) => {
    const uid = String(ctx.from.id);
    if (uid !== SUPER_ADMIN_ID && String(ctx.chat.id) !== ADMIN_GROUP_ID) return;
    const args = ctx.message.text.split(' ');
    const cmd = args[1];
    let db = readDB();
    if (cmd === 'stats') {
        const uCount = Object.keys(db).length;
        const total = Object.values(db).reduce((s, x) => s + (x.balance || 0), 0);
        ctx.reply(`📊 СТАТИСТИКА:\nИгроков: ${uCount}\nМонет: ${total.toFixed(2)} TC`);
    }
    if (cmd === 'give' && args[2] && args[3]) {
        if (db[args[2]]) {
            db[args[2]].balance += parseFloat(args[3]);
            writeDB(db);
            ctx.reply("✅ Баланс пополнен");
            bot.telegram.sendMessage(args[2], `🎁 Бонус от админа: ${args[3]} TC!`).catch(()=>{});
        }
    }
    if (cmd === 'ban' && args[2]) {
        if (db[args[2]]) { db[args[2]].banned = true; writeDB(db); ctx.reply("🚫 Бан выдан"); }
    }
});

// API СЕРВЕР
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
            if (data.action === 'catch_fish') {
                if (u.energy <= 0) msg = "🔋 Нет энергии!";
                else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                else {
                    u.energy -= 1; u.rod_durability -= (u.titanLine ? 1 : 2);
                    let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1) * (u.baitBoost || 1)).toFixed(2));
                    u.fish = parseFloat((u.fish + w).toFixed(2)); u.xp += 25; msg = `Поймал: ${w}кг`;
                    if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 РАНГ АП!"; }
                }
            }

            if (data.action === 'sell_fish') {
                const gain = parseFloat((u.fish * 0.5).toFixed(2));
                u.balance = parseFloat((u.balance + gain).toFixed(2)); u.fish = 0; msg = `Продано на ${gain} TC`;
            }

            if (data.action === 'withdraw') {
                if (u.wallet && u.wallet !== data.wallet) msg = "❌ Кошелек уже привязан!";
                else if (u.balance >= data.amount && data.amount >= 30000) {
                    u.wallet = data.wallet; u.balance -= data.amount;
                    bot.telegram.sendMessage(ADMIN_GROUP_ID, `💰 ВЫВОД: ${uid}\nИмя: ${u.name}\nКошелек: ${data.wallet}\nСумма: ${data.amount} TC`, 
                    Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]]));
                    msg = "📩 Заявка отправлена!";
                } else msg = "❌ Ошибка!";
            }

            if (data.action === 'buy_stars') {
                const shop = {
                    'titan_line': { t: 'Титановая леска', d: 'Прочность -1 вместо -2', p: 50 },
                    'gold_bait': { t: 'Золотая каша', d: '+50% к весу рыбы', p: 100 },
                    'energy_pack': { t: 'Энергетик', d: '+30 энергии мгновенно', p: 30 }
                };
                const item = shop[data.id];
                if (item) {
                    bot.telegram.sendInvoice(uid, {
                        title: item.t, description: item.d, payload: data.id,
                        provider_token: "", currency: "XTR",
                        prices: [{ label: item.t, amount: item.p }]
                    }).catch(e => console.error(e));
                    msg = "💳 Счет отправлен в чат!";
                }
            }

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

bot.action(/pay_(.+)_(.+)/, (ctx) => {
    const [_, uid, amount] = ctx.match;
    bot.telegram.sendMessage(uid, `🎉 Выплата ${amount} TC успешно переведена!`);
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n✅ СТАТУС: ОПЛАЧЕНО");
});

bot.start(ctx => ctx.reply('🎣 Вперёд за уловом!', Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()));
server.listen(process.env.PORT || 10000);
bot.launch();
