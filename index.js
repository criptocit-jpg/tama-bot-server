const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- [БЛОК 1: НАСТРОЙКИ ТЕЛЕГРАМ И АДМИНКИ] ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 

// --- [БЛОК 2: ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ] ---
let users = {};
let logs = ["Сервер Tamacoin 4.1.5: Экономика и анимация обновлены!"];
let serverEvents = ["Добро пожаловать!", "Джекпот пополняется с каждой сделки!"];
let dailyCounters = { goldenCarp: 0, lostWallets: 0 };
let jackpot = { pool: 1000, lastWinner: "Никто" }; // Установлено 1000 TC по умолчанию

// --- [БЛОК 3: КОНСТАНТЫ ЭКОНОМИКИ И ЛИМИТЫ] ---
const MIN_JACKPOT = 1000;      // Минимальный фонд
const SELL_PRICE = 2;          // Цена 1 кг рыбы = 2 TC
const TAX_RATE = 0.05;         // Налог 5% при продаже
const TAX_TO_POOL = 1.0;       // Весь налог (100% от налога, т.е. 5% от суммы) идет в пул
const SHOP_TAX_TO_POOL = 0.05; // 5% от цены покупки в магазине идет в Джекпот
const GOLDEN_LIMIT = 10;       
const WALLET_LIMIT = 200;      
const MIN_WITHDRAW = 30000;    

// --- [БЛОК 4: РАБОТА С ФАЙЛАМИ ДАННЫХ] ---
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            jackpot = data.jackpot || { pool: MIN_JACKPOT, lastWinner: "Никто" };
            dailyCounters = data.dailyCounters || { goldenCarp: 0, lostWallets: 0 };
        } catch(e) { 
            console.error("Ошибка загрузки:", e);
            users = {}; 
        }
    }
}

function saveData() { 
    const dataToSave = { users, jackpot, dailyCounters, lastSave: Date.now() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
}
loadData();

// --- [БЛОК 5: ЛОГИРОВАНИЕ СОБЫТИЙ] ---
function addLog(m) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${m}`);
    serverEvents.unshift(`${m}`);
    if(logs.length > 20) logs.pop();
    if(serverEvents.length > 15) serverEvents.pop();
}

// --- [БЛОК 6: ПЛАНИРОВЩИК И СБРОС ЛИМИТОВ] ---
setInterval(() => {
    const now = new Date();
    if(now.getHours() === 0 && now.getMinutes() === 0) {
        dailyCounters.goldenCarp = 0;
        dailyCounters.lostWallets = 0;
        addLog("Дневные лимиты обновлены");
    }
    if(now.getDay() === 0 && now.getHours() === 21 && now.getMinutes() === 0) {
        awardWeeklyJackpot();
    }
    saveData(); 
}, 60000);

// --- [БЛОК 7: ЛОГИКА ЕЖЕНЕДЕЛЬНОГО ДЖЕКПОТА] ---
function awardWeeklyJackpot() {
    let winner = null;
    let maxActivity = -1;
    for(let id in users) {
        if(users[id].total > maxActivity) {
            maxActivity = users[id].total;
            winner = users[id];
        }
    }
    if(winner && maxActivity > 0) {
        const prize = Math.floor(jackpot.pool);
        winner.b += prize;
        jackpot.lastWinner = winner.n;
        addLog(`🏆 КУШ НЕДЕЛИ: ${winner.n} забирает ${prize} TC!`);
        jackpot.pool = MIN_JACKPOT;
        for(let id in users) users[id].total = 0;
    }
}

// --- [БЛОК 8: ОСНОВНОЙ ОБРАБОТЧИК API] ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();
    if (!userId) return res.status(400).json({ error: "No ID" });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, s: 0,
            fish: 0, energy: 100, dur: 100,
            buffs: { myakish:0, gear:0, titan:0, bait:0, strong:0, license:false },
            total: 0, lastBonus: 0, lastUpdate: now, withdrawals: []
        };
    }

    const u = users[userId];
    let msg = "";
    let catchData = null;

    const passed = now - u.lastUpdate;
    if (passed > 300000) { 
        u.energy = Math.min(100, u.energy + Math.floor(passed / 300000)); 
        u.lastUpdate = now; 
    }

    switch (action) {
        case 'load': break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { msg = "Бонус не готов!"; } 
            else {
                const prize = 50 + Math.floor(Math.random() * 50);
                u.b += prize; u.energy = 100; u.lastBonus = now;
                msg = `Получено ${prize} TC и энергия!`;
                addLog(`${u.n} взял бонус`);
            }
            break;

        case 'cast':
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            if (u.dur <= 0) { msg = "Почини удочку!"; break; }
            u.energy -= 2;
            u.dur = Math.max(0, u.dur - ((u.buffs.titan > now) ? 0.5 : 1));
            u.total = (u.total || 0) + 1;

            let rand = Math.random() * 100;
            if (rand < 5 && (!u.buffs.myakish || u.buffs.myakish <= 0)) { msg = "Срыв! 🐟"; } 
            else if (rand < 7.5 && (!u.buffs.strong || u.buffs.strong < now)) { 
                u.dur = Math.max(0, u.dur - 5); msg = "Обрыв лески! 🪝"; 
            } else {
                let w = (Math.random() * 3 + 0.5);
                if (u.buffs.bait > now) w *= 2;
                if (new Date().getHours() === 19) w *= 2;
                u.fish += w;
                if (u.buffs.myakish > 0) u.buffs.myakish--;
                catchData = { type: "Рыба", w: w.toFixed(2) };

                if (u.buffs.license) {
                    if (dailyCounters.goldenCarp < GOLDEN_LIMIT && Math.random() < 0.01) {
                        u.fish += 5000; catchData = { type: "Золотой Карп!", w: 5000 };
                        dailyCounters.goldenCarp++;
                        addLog(`${u.n} поймал Золотого Карпа!`);
                    }
                    if (dailyCounters.lostWallets < WALLET_LIMIT && Math.random() < 0.005) {
                        const walletTC = 100 + Math.floor(Math.random() * 201);
                        u.b += walletTC; dailyCounters.lostWallets++;
                        addLog(`${u.n} выловил кошелек +${walletTC} TC!`);
                    }
                }
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "Садок пуст!"; break; }
            const income = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(income * TAX_RATE);
            jackpot.pool += tax; // 5% от продажи идет в пул
            u.b += (income - tax);
            u.fish = 0;
            msg = `Продано на ${income - tax} TC (Налог ${tax} TC)`;
            break;

        case 'buy':
            const item = payload.id;
            const prices = { myakish:100, gear:200, energy:50, repair:50, titan:150, bait:200, strong:200, license:500 };
            if (u.b < prices[item]) { msg = "Недостаточно TC!"; break; }
            u.b -= prices[item];
            jackpot.pool += (prices[item] * SHOP_TAX_TO_POOL); // 5% от покупки в пул

            if (item === 'myakish') u.buffs.myakish += 10;
            if (item === 'energy') u.energy = 100;
            if (item === 'repair') u.dur = 100;
            const h = 3600000;
            if (item === 'gear') u.buffs.gear = now + (24 * h);
            if (item === 'titan') u.buffs.titan = now + (12 * h);
            if (item === 'bait') u.buffs.bait = now + (3 * h);
            if (item === 'strong') u.buffs.strong = now + (24 * h);
            if (item === 'license') u.buffs.license = true;
            msg = "Успешно куплено!";
            break;

        case 'withdraw':
            const { wallet, sum } = payload;
            const amt = parseInt(sum);
            if (!wallet || isNaN(amt) || amt < MIN_WITHDRAW) { msg = `Минимум ${MIN_WITHDRAW} TC`; break; }
            if (u.b < amt) { msg = "Мало TC!"; break; }
            u.b -= amt;
            u.withdrawals.push({ id: Math.floor(Math.random()*99999), wallet, sum: amt, status: 'pending', date: now });
            try {
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: ADMIN_ID, parse_mode: 'HTML',
                    text: `💰 <b>ВЫВОД</b>\nЮзер: ${u.n}\nСумма: ${amt} TC\nКошелек: <code>${wallet}</code>`
                });
                msg = "Заявка отправлена!";
            } catch(e) { msg = "Ошибка уведомления админа!"; }
            break;

        case 'get_events':
            return res.json({ events: serverEvents });
    }

    saveData();
    const top = Object.values(users).sort((a,b) => b.b - a.b).slice(0, 10).map(x => ({ n: x.n, b: x.b }));
    res.json({ ...u, msg, catchData, top, logs, events: serverEvents, jackpot: jackpot });
});

app.post('/api/admin/users', (req, res) => {
    if (String(req.body.userId) !== String(ADMIN_ID)) return res.status(403).send("No");
    res.json(Object.values(users).map(u => ({ id:u.id, n:u.n, b:u.b, total:u.total })));
});

app.listen(PORT, () => console.log(`[OK] Monolith 4.1.5 активен на порту ${PORT}`));
