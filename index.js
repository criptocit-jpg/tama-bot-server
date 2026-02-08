const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_GROUP_ID = '-5110681605'; 
const SUPER_ADMIN_ID = '7883085758'; // Твой личный ID для команд везде
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

// --- КОМАНДЫ БОГА (/admin) ---
bot.command('admin', (ctx) => {
    const uid = String(ctx.from.id);
    const chatid = String(ctx.chat.id);
    
    if (uid !== SUPER_ADMIN_ID && chatid !== ADMIN_GROUP_ID) return;

    const args = ctx.message.text.split(' ');
    const cmd = args[1];
    let db = readDB();

    if (!cmd || cmd === 'help') {
        return ctx.reply("🛠 ПАНЕЛЬ БОГА:\n/admin stats - Статистика\n/admin give [id] [sum] - Дать монет\n/admin ban [id] - Бан\n/admin unban [id] - Разбан");
    }

    if (cmd === 'stats') {
        const users = Object.keys(db).length;
        const totalCoins = Object.values(db).reduce((a, b) => a + (b.balance || 0), 0);
        return ctx.reply(`📊 СТАТИСТИКА:\nИгроков: ${users}\nМонет в обороте: ${totalCoins.toFixed(2)} TC`);
    }

    if (cmd === 'give' && args[2] && args[3]) {
        const targetId = args[2];
        const amount = parseFloat(args[3]);
        if (db[targetId]) {
            db[targetId].balance += amount;
            writeDB(db);
            ctx.reply(`✅ Выдано ${amount} TC игроку ${targetId}`);
            bot.telegram.sendMessage(targetId, `🎁 Админ начислил вам ${amount} TC!`).catch(()=>{});
        } else ctx.reply("❌ Юзер не найден");
    }

    if (cmd === 'ban' && args[2]) {
        if (db[args[2]]) {
            db[args[2]].banned = true;
            writeDB(db);
            ctx.reply("🚫 Игрок заблокирован");
        }
    }
});

// Платежи Stars
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
    let db = readDB();
    const u = getUpdatedUser(db, String(ctx.from.id));
    const payload = ctx.message.successful_payment.invoice_payload;
    if (payload === 'titan_line') u.titanLine = true;
    if (payload === 'gold_bait') u.baitBoost = 1.5;
    if (payload === 'energy_pack') u.energy += 30;
    writeDB(db);
    ctx.reply('✅ Предмет активирован!');
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

            if (u.banned) {
                res.end(JSON.stringify({ banned: true, msg: "ВЫ ЗАБАНЕНЫ" }));
                return;
            }

            let msg = "";
            if (data.action === 'catch_fish') {
                if (u.energy <= 0) msg = "🔋 Нет энергии!";
                else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                else {
                    u.energy -= 1; u.rod_durability -= (u.titanLine ? 1 : 2);
                    let w = parseFloat((Math.random() * 1.5 * (1 + u.level * 0.1) * (u.baitBoost || 1)).toFixed(2));
                    u.fish = parseFloat((u.fish + w).toFixed(2)); u.xp += 25; msg = `Поймал: ${w}кг`;
                    if (u.xp >= (u.level * 400)) { u.level++; u.xp = 0; msg = "🎊 НОВЫЙ РАНГ!"; }
                }
            }
            
            if (data.action === 'sell_fish') {
                const gain = parseFloat((u.fish * 0.5).toFixed(2));
                u.balance = parseFloat((u.balance + gain).toFixed(2)); u.fish = 0; msg = `Продано на ${gain} TC`;
            }

            if (data.action === 'withdraw') {
                // ПРИВЯЗКА КОШЕЛЬКА
                if (u.wallet && u.wallet !== data.wallet) {
                    msg = "❌ Кошелек привязан к другому адресу!";
                } else if (u.balance >= data.amount && data.amount >= 30000) {
                    u.wallet = data.wallet; // Закрепляем кошелек
                    u.balance -= data.amount;
                    bot.telegram.sendMessage(ADMIN_GROUP_ID, `💰 ЗАЯВКА: ${uid}\nИмя: ${u.name}\nКошелек: ${data.wallet}\nСумма: ${data.amount} TC`, 
                    Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]]));
                    msg = "📩 Заявка отправлена!";
                } else msg = "❌ Ошибка!";
            }

            if (data.action === 'buy_stars') {
                const items = {'titan_line':50, 'gold_bait':100, 'energy_pack':30};
                bot.telegram.sendInvoice(uid, 'Предмет', 'Магазин', data.id, "", "XTR", [{ label: 'Купить', amount: items[data.id] }]);
                msg = "💳 Счет отправлен!";
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
