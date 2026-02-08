const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

// ==========================================
//   КОНФИГУРАЦИЯ И НАСТРОЙКИ
// ==========================================
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const DB_PATH = './database.json';

const ECO = { 
    FISH_PRICE: 0.1, 
    REPAIR_COST: 10, 
    BAIT_COST: 25,
    REGEN_TIME: 900000, // 15 минут
    GOLDEN_HOUR: 19,    // Час X для х2 улова
    MIN_WITHDRAW: 30000 
};

const bot = new Telegraf(BOT_TOKEN);

// ==========================================
//   РАБОТА С БАЗОЙ ДАННЫХ
// ==========================================
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function writeDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) { console.error('Ошибка записи БД'); }
}

function getUpdatedUser(db, uid, name = "Рыбак") {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, 
            fish: 0, 
            rod_durability: 100, 
            level: 1, 
            xp: 0, 
            energy: 15, 
            lastRegen: Date.now(),
            baits: 0, 
            name: name,
            unlockedLocs: ['Заводь'], 
            currentLoc: 'Заводь',
            referrals: 0
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

// ==========================================
//   API СЕРВЕР (HTTP)
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    let db = readDB();

    // Загрузка данных пользователя
    if (parsedUrl.pathname === '/api/action' && req.method === 'GET') {
        const uid = String(parsedUrl.query.userId);
        if (uid && uid !== "undefined") {
            const u = getUpdatedUser(db, uid);
            writeDB(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(u));
        }
    }

    // Обработка действий
    if (parsedUrl.pathname === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const uid = String(data.userId);
                let u = getUpdatedUser(db, uid);
                let msg = "";

                if (data.action === 'catch_fish') {
                    if (u.energy <= 0) msg = "🔋 Нет энергии! Жди регенерации.";
                    else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                    else {
                        u.energy -= 1;
                        u.rod_durability -= 2;

                        // 1. Шанс на обрыв (при низкой прочности)
                        if (u.rod_durability < 15 && Math.random() < 0.3) {
                            msg = "💥 ОБРЫВ ЛЕСКИ! Удочка почти в щепки.";
                        }
                        // 2. Шанс на джекпот (0.5%)
                        else if (Math.random() < 0.005) {
                            const loot = Math.random() > 0.5 ? 100 : "LIC_SEA";
                            if (loot === 100) {
                                u.balance += 100;
                                msg = "🎁 СУНДУК ПИРАТА! Нашел 100 TC!";
                            } else {
                                if (!u.unlockedLocs.includes("Море")) u.unlockedLocs.push("Море");
                                msg = "🎁 НАХОДКА! Лицензия на Море (1 день)";
                            }
                        }
                        // 3. Шанс на сапог (10%)
                        else if (Math.random() < 0.1) {
                            msg = "👞 Эх... Выловил дырявый сапог.";
                        }
                        // 4. Обычная ловля
                        else {
                            let pool = [{n:'🐟 Плотва',w:0.5,x:15}, {n:'🐠 Окунь',w:1.2,x:25}];
                            if (u.currentLoc === 'Река') pool = [{n:'🐡 Щука',w:4.0,x:60}, {n:'👑 Стерлядь',w:14.0,x:300}];
                            
                            const f = pool[Math.floor(Math.random() * pool.length)];
                            let w = parseFloat((f.w * (1 + u.level * 0.1)).toFixed(2));
                            
                            // Золотой час
                            const h = new Date().getHours();
                            if (h === ECO.GOLDEN_HOUR) {
                                w *= 2;
                                msg = "🌟 КОСЯК РЫБ (x2)! ";
                            }

                            if (u.baits > 0) { w *= 2; u.baits--; msg += "🍞 Приманка! "; }
                            
                            u.fish = parseFloat((Number(u.fish) + w).toFixed(2));
                            u.xp += f.x;
                            msg += `Улов: ${f.n} (${w}кг)`;

                            if (u.xp >= (u.level * 400)) {
                                u.level++; u.xp = 0;
                                msg = "🎊 НОВЫЙ РАНГ: " + u.level;
                            }
                        }
                    }
                }

                if (data.action === 'sell_fish') {
                    const gain = parseFloat((Number(u.fish) * ECO.FISH_PRICE).toFixed(2));
                    u.balance = parseFloat((Number(u.balance) + gain).toFixed(2));
                    u.fish = 0;
                    msg = `Продано на ${gain} TC`;
                }

                if (data.action === 'repair_rod' && u.balance >= ECO.REPAIR_COST) {
                    u.balance -= ECO.REPAIR_COST;
                    u.rod_durability = 100;
                    msg = "Удочка как новая!";
                }

                if (data.action === 'buy_bait' && u.balance >= ECO.BAIT_COST) {
                    u.balance -= ECO.BAIT_COST;
                    u.baits += 10;
                    msg = "Куплено 10 приманок!";
                }

                if (data.action === 'withdraw') {
                    if (u.balance < ECO.MIN_WITHDRAW) {
                        msg = "❌ Минимум 30,000 TC!";
                    } else {
                        bot.telegram.sendMessage(ADMIN_ID, `💰 ЗАЯВКА НА ВЫВОД\nЮзер: ${uid}\nКошелек: ${data.wallet}\nСумма: ${data.amount} TC`, 
                        Markup.inlineKeyboard([[Markup.button.callback('✅ ОПЛАЧЕНО', `pay_${uid}_${data.amount}`)]]));
                        msg = "✅ Заявка отправлена!";
                    }
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

// ==========================================
//   ЛОГИКА ТЕЛЕГРАМ БОТА
// ==========================================
bot.action(/pay_(.+)_(.+)/, (ctx) => {
    const [_, uid, amount] = ctx.match;
    bot.telegram.sendMessage(uid, `🎉 Ваша выплата в размере ${amount} TC успешно отправлена!`).catch(e=>{});
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n✅ ВЫПОЛНЕНО");
});

bot.start(ctx => {
    ctx.reply('🌊 TAMA FISHING 2026\nЛови рыбу, качай ранг и выводи TC!', 
    Markup.keyboard([[Markup.button.webApp('🎣 ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});

// ЗАПУСК СЕРВЕРА С ПРАВИЛЬНЫМ ПОРТОМ
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});

bot.launch().then(() => console.log('🤖 БОТ АКТИВИРОВАН'));
