const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; // Твой личный ID
const DB_PATH = './database.json';

const bot = new Telegraf(BOT_TOKEN);

// Работа с БД
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
    const gain = Math.floor((now - u.lastRegen) / 900000); // 15 мин
    if (gain > 0) { u.energy = Math.min(maxE, u.energy + gain); u.lastRegen = now; }
    return u;
}

// 1. ЛОГИКА РЕФЕРАЛОВ И СТАРТА
bot.start((ctx) => {
    const uid = String(ctx.from.id);
    const refId = ctx.payload; // ID того, кто позвал
    let db = readDB();
    const isNew = !db[uid];

    let u = getUpdatedUser(db, uid, ctx.from.first_name);

    if (isNew && refId && refId !== uid && db[refId]) {
        // ПОДАРОК: 3 коробки = 15,000 TC
        db[refId].balance += 15000;
        bot.telegram.sendMessage(refId, `🎁 Вам начислено 15,000 TC (3 Подарочных коробки) за приглашение ${ctx.from.first_name}!`);
    }
    
    writeDB(db);
    ctx.reply(`🎣 Привет, ${ctx.from.first_name}! Готов ловить рыбу на мотоцикл?`, 
    Markup.keyboard([[Markup.button.webApp('ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

// 2. ПРАВА БОГА (АДМИН-ПАНЕЛЬ)
bot.command('admin', (ctx) => {
    const uid = String(ctx.from.id);
    if (uid !== SUPER_ADMIN_ID && String(ctx.chat.id) !== ADMIN_GROUP_ID) return;
    
    const args = ctx.message.text.split(' ');
    const cmd = args[1];
    let db = readDB();

    if (cmd === 'list') {
        let list = "👤 **СПИСОК ИГРОКОВ:**\n\n";
        const players = Object.entries(db).slice(-15); 
        players.forEach(([id, p]) => {
            list += `🔹 ${p.name || 'Incognito'} | ID: \`${id}\` | 💰 ${Math.floor(p.balance)} TC\n`;
        });
        return ctx.reply(list, { parse_mode: 'Markdown' });
    }

    if (cmd === 'stats') {
        const count = Object.keys(db).length;
        const total = Object.values(db).reduce((a, b) => a + (b.balance || 0), 0);
        return ctx.reply(`📊 СТАТИСТИКА:\nИгроков: ${count}\nВсего монет: ${total.toFixed(2)} TC`);
    }

    if (cmd === 'give' && args[2] && args[3]) {
        const target = args[2];
        const sum = parseFloat(args[3]);
        if (db[target]) {
            db[target].balance += sum;
            writeDB(db);
            ctx.reply(`✅ Выдано ${sum} TC пользователю ${target}`);
            bot.telegram.sendMessage(target, `🎁 Админ выдал вам подарок: ${sum} TC!`).catch(()=>{});
        } else ctx.reply("❌ ID не найден");
    }

    if (cmd === 'ban' && args[2]) {
        if (db[args[2]]) {
            db[args[2]].banned = true;
            writeDB(db);
            ctx.reply(`🚫 Игрок ${args[2]} забанен.`);
        }
    }
});

// 3. ПЛАТЕЖИ STARS
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
    let db = readDB();
    const u = getUpdatedUser(db, String(ctx.from.id));
    const item = ctx.message.successful_payment.invoice_payload;
    if (item === 'titan_line') u.titanLine = true;
    if (item === 'gold_bait') u.baitBoost = 1.5;
    if (item === 'energy_pack') u.energy += 30;
    writeDB(db);
    ctx.reply('🎉 Покупка подтверждена! Спасибо за поддержку проекта.');
});

// 4. API ДЛЯ WEBAPP
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
                if (u.energy <= 0) msg = "🔋 Энергия на нуле!";
                else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                else {
                    u.energy -= 1; u.rod_durability -= (u.titanLine ? 1 : 2);
                    let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1) * (u.baitBoost || 1)).toFixed(2));
                    u.fish = parseFloat((u.fish + w).toFixed(2)); u.xp += 25; msg = `Поймал: ${w}кг`;
                    if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 РАНГ ПОВЫШЕН!"; }
                }
            }

            if (data.action === 'sell_fish') {
                const gain = parseFloat((u.fish * 0.5).toFixed(2));
                u.balance = parseFloat((u.balance + gain).toFixed(2)); u.fish = 0; msg = `Продано на ${gain} TC`;
            }

            if (data.action === 'withdraw') {
                if (u.wallet && u.wallet !== data.wallet) msg = "❌ Кошелек уже привязан к другому адресу!";
                else if (u.balance >= data.amount && data.amount >= 30000) {
                    u.wallet = data.wallet; u.balance -= data.amount;
                    bot.telegram.sendMessage(ADMIN_GROUP_ID, `💰 ВЫВОД: \`${uid}\`\nИгрок: ${u.name}\nКошелек: \`${data.wallet}\`\nСумма: ${data.amount} TC`, 
                    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]]) });
                    msg = "📩 Заявка в обработке!";
                } else msg = "❌ Недостаточно TC!";
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
                    }).catch(e => console.error("Invoice Error:", e));
                    msg = "💳 Счет отправлен!";
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
    bot.telegram.sendMessage(uid, `🎉 Выплата ${amount} TC подтверждена!`).catch(()=>{});
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n✅ СТАТУС: ОПЛАЧЕНО");
});

server.listen(process.env.PORT || 10000);
bot.launch();
