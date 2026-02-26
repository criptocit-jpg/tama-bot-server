const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- Константы проекта ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 

let users = {};
let logs = ["Сервер Tamacoin Monolith 4.1.3 запущен!"];
let serverEvents = ["Добро пожаловать в Tamacoin!", "Рыбалка открыта!"];
let dailyCounters = { goldenCarp: 0, lostWallets: 0 };
let jackpot = { pool: 15000, lastWinner: "Никто" };

// --- Лимиты и Настройки ---
const GOLDEN_LIMIT = 10;
const WALLET_LIMIT = 200;
const MIN_WITHDRAW = 30000;
const SELL_PRICE = 2; // 1 кг = 2 TC
const TAX_RATE = 0.05; // 5% налог

// --- Работа с данными ---
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            jackpot = data.jackpot || { pool: 15000, lastWinner: "Никто" };
            dailyCounters = data.dailyCounters || { goldenCarp: 0, lostWallets: 0 };
        } catch(e) { 
            console.error("Ошибка загрузки данных:", e);
            users = {}; 
        }
    }
}

function saveData() { 
    const dataToSave = {
        users,
        jackpot,
        dailyCounters,
        lastSave: Date.now()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
}

loadData();

// --- Логирование ---
function addLog(m) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${m}`);
    serverEvents.unshift(`${m}`);
    if(logs.length > 20) logs.pop();
    if(serverEvents.length > 15) serverEvents.pop();
}

// --- Планировщик задач ---
setInterval(() => {
    const now = new Date();
    // Сброс лимитов в полночь
    if(now.getHours() === 0 && now.getMinutes() === 0) {
        dailyCounters.goldenCarp = 0;
        dailyCounters.lostWallets = 0;
        addLog("Дневные лимиты сброшены");
    }
    saveData(); // Автосохранение каждые 60 сек
}, 60000);

// --- Проверка прав ---
function isAdmin(id) { return String(id) === String(ADMIN_ID); }

// --- Основной API Обработчик ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "No user ID" });

    // Инициализация пользователя (Золотая База)
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            n: userName || "Рыбак",
            b: 150, // Стартовый баланс
            s: 0,
            fish: 0,
            energy: 100,
            dur: 100,
            buffs: { 
                myakish: 0, 
                gear: 0, 
                titan: 0, 
                bait: 0, 
                strong: 0, 
                license: false 
            },
            total: 0,
            lastBonus: 0,
            lastUpdate: now,
            boxes: 0,
            withdrawals: []
        };
        addLog(`Новый игрок: ${userName}`);
    }

    const u = users[userId];
    let msg = "";
    let catchData = null;

    // Регенерация энергии (раз в 5 минут +1)
    const passed = now - u.lastUpdate;
    if (passed > 300000) { 
        const recovery = Math.floor(passed / 300000);
        u.energy = Math.min(100, u.energy + recovery); 
        u.lastUpdate = now; 
    }

    // Обработка действий
    switch (action) {
        case 'load': 
            msg = "Данные загружены";
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { 
                msg = "Бонус еще не готов! Приходите позже."; 
            } else {
                const prize = 50 + Math.floor(Math.random() * 50);
                u.b += prize; 
                u.energy = 100; 
                u.lastBonus = now;
                msg = `Получено ${prize} TC и полная Энергия! 🎁`;
                addLog(`${u.n} забрал ежедневный бонус`);
            }
            break;

        case 'cast':
            if (u.energy < 2) { msg = "Недостаточно энергии! ⚡"; break; }
            if (u.dur <= 0) { msg = "Удочка сломана! Почини её в магазине 🛠️"; break; }
            
            u.energy -= 2;
            // Титановая леска уменьшает износ
            const wear = (u.buffs.titan > now) ? 0.5 : 1;
            u.dur = Math.max(0, u.dur - wear);

            let rand = Math.random() * 100;
            
            // Проверки на неудачи
            if (rand < 5 && (!u.buffs.myakish || u.buffs.myakish <= 0)) { 
                msg = "Срыв! Рыба ушла... 🐟"; 
            } else if (rand < 7.5 && (!u.buffs.strong || u.buffs.strong < now)) { 
                u.dur = Math.max(0, u.dur - 5); 
                msg = "Ой! Леска оборвалась! 🪝"; 
            } else {
                // Успешный улов
                let w = (Math.random() * 3 + 0.5);
                if (u.buffs.bait > now) w *= 2; // Прикормка x2
                if (new Date().getHours() === 19) { // Золотой час
                    w *= 2;
                    addLog(`Золотой час: ${u.n} ловит двойной вес!`);
                }
                
                u.fish += w;
                if (u.buffs.myakish > 0) u.buffs.myakish--;
                catchData = { type: "Обычная рыба", w: w.toFixed(2) };

                // Редкие события (только с лицензией "Озеро Надежды")
                if (u.buffs.license) {
                    // Золотой Карп
                    if (dailyCounters.goldenCarp < GOLDEN_LIMIT && Math.random() < 0.015) {
                        const goldPrize = 5000;
                        u.fish += goldPrize;
                        catchData = { type: "Золотой Карп! 🌟", w: goldPrize };
                        dailyCounters.goldenCarp++;
                        addLog(`🔥 ЛЕГЕНДА: ${u.n} поймал Золотого Карпа!`);
                    }
                    // Утерянный кошелек
                    if (dailyCounters.lostWallets < WALLET_LIMIT && Math.random() < 0.008) {
                        const walletTC = 100 + Math.floor(Math.random() * 201);
                        u.b += walletTC;
                        dailyCounters.lostWallets++;
                        addLog(`💰 ${u.n} выловил старый кошелек: +${walletTC} TC!`);
                        msg = `Вы нашли кошелек с ${walletTC} TC!`;
                    }
                }

                // Шанс на Джекпот (0.01%)
                if (Math.random() < 0.0001) {
                    const winAmount = jackpot.pool;
                    u.b += winAmount;
                    jackpot.pool = 15000; // Сброс
                    jackpot.lastWinner = u.n;
                    addLog(`🏆 ДЖЕКПОТ!!! ${u.n} забирает ${winAmount} TC!`);
                    msg = `БОЖЕ МОЙ! ВЫ ВЫИГРАЛИ ДЖЕКПОТ: ${winAmount} TC!`;
                } else {
                    jackpot.pool += 5; // Накопление
                }
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "В садке пусто. Сначала налови рыбы!"; break; }
            const rawIncome = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(rawIncome * TAX_RATE);
            const finalIncome = rawIncome - tax;
            
            u.b += finalIncome;
            u.fish = 0;
            msg = `Рыба продана! Получено: ${finalIncome} TC (Налог: ${tax})`;
            addLog(`${u.n} продал улов за ${finalIncome} TC`);
            break;

        case 'buy':
            const item = payload.id;
            const prices = { 
                myakish: 100, gear: 200, energy: 50, repair: 50, 
                titan: 150, bait: 200, strong: 200, license: 500 
            };
            
            if (u.b < prices[item]) { msg = "Недостаточно TC на балансе!"; break; }
            
            u.b -= prices[item];
            const hour = 3600000;
            
            if (item === 'myakish') u.buffs.myakish += 10;
            if (item === 'energy') u.energy = 100;
            if (item === 'repair') u.dur = 100;
            if (item === 'gear') u.buffs.gear = now + (24 * hour);
            if (item === 'titan') u.buffs.titan = now + (12 * hour);
            if (item === 'bait') u.buffs.bait = now + (3 * hour);
            if (item === 'strong') u.buffs.strong = now + (24 * hour);
            if (item === 'license') {
                u.buffs.license = true;
                addLog(`📜 ${u.n} приобрел Лицензию на Озеро Надежды!`);
            }
            
            msg = "Покупка прошла успешно! 🎉";
            break;

        case 'withdraw':
            const { wallet, sum } = payload;
            const amt = parseInt(sum);
            if (!wallet || isNaN(amt) || amt < MIN_WITHDRAW) { 
                msg = `Минимальная сумма вывода: ${MIN_WITHDRAW} TC`; 
                break; 
            }
            if (u.b < amt) { msg = "На балансе меньше, чем вы хотите вывести!"; break; }

            u.b -= amt; // Списываем сразу
            if (!u.withdrawals) u.withdrawals = [];
            const wId = Math.floor(Math.random() * 1000000);
            
            u.withdrawals.push({ id: wId, wallet, sum: amt, status: 'pending', date: now });
            
            try {
                const text = `💰 <b>ЗАЯВКА НА ВЫВОД</b>\n\n👤 Игрок: ${u.n}\n💵 Сумма: <b>${amt} TC</b>\n👛 Кошелек: <code>${wallet}</code>\n🆔 ID: ${wId}`;
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: ADMIN_ID,
                    text,
                    parse_mode: 'HTML'
                });
                msg = "Заявка принята и отправлена на проверку! ✅";
                addLog(`Вывод: ${u.n} запросил ${amt} TC`);
            } catch(err) {
                msg = "Заявка создана, но уведомление админу не ушло. Свяжитесь с поддержкой.";
            }
            break;

        case 'get_events':
            return res.json({ events: serverEvents });
    }

    saveData();
    // Топ-10 игроков
    const top = Object.values(users)
        .sort((a, b) => b.b - a.b)
        .slice(0, 10)
        .map(x => ({ n: x.n, b: x.b }));

    res.json({
        ...u,
        msg,
        catchData,
        top,
        logs,
        events: serverEvents,
        jackpot: jackpot
    });
});

// --- Админ-панель (Защищенная) ---
app.post('/api/admin/users', (req, res) => {
    if (!isAdmin(req.body.userId)) return res.status(403).send("Forbidden");
    const list = Object.values(users).map(u => ({
        id: u.id, name: u.n, balance: Math.floor(u.b), energy: u.energy, dur: u.dur
    }));
    res.json(list);
});

app.post('/api/admin/balance', (req, res) => {
    const { userId, target, amount, type } = req.body;
    if (!isAdmin(userId)) return res.status(403).send("Forbidden");
    const u = users[target];
    if (u) {
        const val = parseInt(amount);
        if (type === "add") u.b += val;
        else u.b = Math.max(0, u.b - val);
        saveData();
        res.json({ ok: true });
    } else res.json({ error: "User not found" });
});

app.listen(PORT, () => console.log(`[OK] Monolith 4.1.3 active on port ${PORT}`));
