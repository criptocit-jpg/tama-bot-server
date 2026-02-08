const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');
const url = require('url');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const DB_PATH = './database.json';
const bot = new Telegraf(BOT_TOKEN);

const ECO = { 
    FISH_PRICE: 0.1, 
    REPAIR_COST: 10, 
    BAIT_COST: 25,
    REGEN_TIME: 900000,
    GOLDEN_HOUR: 19 // Час (с 19:00 до 20:00), когда клёв х2
};

function readDB() {
    try { return fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : {}; }
    catch (e) { return {}; }
}

function writeDB(db) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) {}
}

function getUpdatedUser(db, uid) {
    if (!db[uid]) {
        db[uid] = { 
            balance: 0, fish: 0, rod_durability: 100, 
            level: 1, xp: 0, energy: 15, lastRegen: Date.now(),
            baits: 0, unlockedLocs: ['Заводь'], currentLoc: 'Заводь'
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(u));
        }
    }

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
                    if (u.energy <= 0) msg = "🔋 Нет энергии!";
                    else if (u.rod_durability <= 0) msg = "⚠️ Удочка сломана!";
                    else {
                        u.energy -= 1;
                        u.rod_durability -= 2;
                        
                        // 1. Проверка на обрыв лески (если прочность < 15%)
                        if (u.rod_durability < 15 && Math.random() < 0.3) {
                            msg = "💥 ОБРЫВ ЛЕСКИ! Рыба ушла...";
                        } 
                        // 2. Проверка на сапог (шанс 10%)
                        else if (Math.random() < 0.1) {
                            msg = "👞 Эх... Выловил старый сапог.";
                        } 
                        // 3. Успешная ловля
                        else {
                            let pool = [{n:'🐟 Плотва',w:0.5,x:15}, {n:'🐠 Окунь',w:1.2,x:25}];
                            if (u.currentLoc === 'Река') pool = [{n:'🐡 Щука',w:4.0,x:60}, {n:'👑 Стерлядь',w:14.0,x:300}];
                            
                            const f = pool[Math.floor(Math.random() * pool.length)];
                            let w = parseFloat((f.w * (1 + u.level * 0.1)).toFixed(2));
                            
                            // Бонус Золотого часа (проверка времени сервера)
                            const currentHour = new Date().getUTCHours() + 5; // +5 для твоего часового пояса
                            if (currentHour === ECO.GOLDEN_HOUR) {
                                w *= 2;
                                msg = "🌟 КОСЯК РЫБ! (x2) ";
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
                    msg = "Удочка починена!";
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server Live`));

bot.start(ctx => {
    ctx.reply('🎣 TAMA FISHING 2026\nЗолотой час сегодня в 19:00!', 
    Markup.keyboard([[Markup.button.webApp('🎣 ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize());
});
bot.launch();
