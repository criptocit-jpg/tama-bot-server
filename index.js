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
    if (gain > 0) { u.energy = Math.min(maxE, u.energy + gain); u.lastRegen = now; }
    return u;
}

// РЕФЕРАЛЫ И КОМАНДЫ
bot.start(async (ctx) => {
    const uid = String(ctx.from.id);
    const refId = ctx.startPayload;
    let db = readDB();
    const isNew = !db[uid];
    getUpdatedUser(db, uid, ctx.from.first_name);
    if (isNew && refId && refId !== uid && db[refId]) {
        db[refId].boxes = (db[refId].boxes || 0) + 1;
        bot.telegram.sendMessage(refId, `🎁 Вам начислен сундук за приглашение друга!`).catch(() => {});
    }
    writeDB(db);
    ctx.reply(`🎣 Привет, Рыбак!`, Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

bot.command('admin', (ctx) => {
    const uid = String(ctx.from.id);
    if (uid !== SUPER_ADMIN_ID && String(ctx.chat.id) !== ADMIN_GROUP_ID) return;
    const args = ctx.message.text.split(' ');
    const cmd = args[1];
    let db = readDB();
    if (cmd === 'list') {
        let l = "👥 ИГРОКИ:\n";
        Object.entries(db).slice(-15).forEach(([id, u]) => l += `🔹 ${u.name} | ID: \`${id}\` | 💰 ${Math.floor(u.balance)}\n`);
        ctx.reply(l, { parse_mode: 'Markdown' });
    }
    if (cmd === 'give' && args[2]) {
        if (db[args[2]]) { db[args[2]].balance += parseFloat(args[3]); writeDB(db); ctx.reply("✅ Готово"); }
    }
});

// API СЕРВЕР (СИНХРОНИЗИРОВАН С HTML)
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    if (parsedUrl.pathname === '/api/action') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const uid = String(data.userId);
                let u = getUpdatedUser(db, uid, data.userName);
                let msg = "";

                if (data.action === 'catch_fish') {
                    if (u.energy > 0 && u.rod_durability > 0) {
                        u.energy--; u.rod_durability -= (u.titanLine ? 1 : 2);
                        let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1) * (u.baitBoost || 1)).toFixed(2));
                        u.fish = parseFloat((u.fish + w).toFixed(2)); u.xp += 25; msg = `Улов: ${w}кг`;
                        if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 УРОВЕНЬ ПОВЫШЕН!"; }
                    } else msg = "🔋 Нет энергии или сломана удочка!";
                }
                if (data.action === 'sell_fish') {
                    let g = parseFloat((u.fish * 0.5).toFixed(2));
                    u.balance += g; u.fish = 0; msg = `Продано на ${g} TC`;
                }
                if (data.action === 'open_box' && u.boxes > 0) {
                    u.boxes--;
                    const win = [5000, 10000, 25000, 50000][Math.floor(Math.random()*4)];
                    u.balance += win; msg = `🎁 Выпало ${win} TC!`;
                }
                if (data.action === 'buy_stars') {
                    const shop = { 'titan_line': {t:'Титановая леска', d:'Прочность -1', p:50}, 'gold_bait':{t:'Золотая каша', d:'+50% веса', p:100}, 'energy_pack':{t:'Энергетик', d:'+30 энергии', p:30} };
                    const item = shop[data.id];
                    if (item) {
                        await bot.telegram.sendInvoice(uid, { title: item.t, description: item.d, payload: data.id, provider_token: "", currency: "XTR", prices: [{ label: item.t, amount: item.p }] }).catch(e => console.error(e));
                        msg = "💳 Счет выставлен!";
                    }
                }
                if (data.action === 'withdraw') {
                    if (u.balance >= data.amount && data.amount >= 30000) {
                        u.balance -= data.amount; u.wallet = data.wallet;
                        bot.telegram.sendMessage(ADMIN_GROUP_ID, `💰 ВЫВОД: ${u.name}\nСумма: ${data.amount}\nКошелек: \`${u.wallet}\``, Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]])).catch(e=>{});
                        msg = "📩 Заявка отправлена!";
                    } else msg = "❌ Недостаточно средств!";
                }

                writeDB(db);
                res.end(JSON.stringify({ ...u, msg }));
            });
        } else {
            const u = getUpdatedUser(db, String(parsedUrl.query.userId));
            const top = Object.values(db).sort((a,b)=>b.balance-a.balance).slice(0,10).map(i=>({n:i.name, b:i.balance}));
            res.end(JSON.stringify({ ...u, top }));
        }
    } else { res.end("OK"); }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
    let db = readDB(); const u = getUpdatedUser(db, String(ctx.from.id));
    const p = ctx.message.successful_payment.invoice_payload;
    if (p === 'titan_line') u.titanLine = true;
    if (p === 'gold_bait') u.baitBoost = 1.5;
    if (p === 'energy_pack') u.energy += 30;
    writeDB(db); ctx.reply('✅ Покупка прошла!');
});

bot.action(/pay_(.+)_(.+)/, (ctx) => { ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n✅ ОПЛАЧЕНО"); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0');

async function startup() {
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        setTimeout(() => bot.launch().catch(() => startup()), 2000);
    } catch (e) { setTimeout(startup, 5000); }
}
startup();
