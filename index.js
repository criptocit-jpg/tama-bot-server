const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- НАСТРОЙКИ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 

// ЦЕНЫ В TON (ТВОИ УСЛОВИЯ)
const PRICES_TON = {
    'vip_bait': 1.0,        // Приманка (7 дней, x3 вес / x6 Золотой час)
    'titan_rod_7': 1.0,     // Титановая удочка (7 дней, нет поломок и срывов)
    'hope_lake_7': 2.0,     // Озеро Надежды (7 дней, Карпы + Кошельки)
    'vip_status_14': 3.0    // VIP Статус (14 дней, лимит 10к, безлимит энергия, иконка)
};

let users = {};
let logs = ["Сервер 5.5.0: ГИБРИДНЫЙ МОНОЛИТ АКТИВИРОВАН (LUCKY BOX + VIP)"];
let serverEvents = ["Админ-панель запущена", "Золотые карпы: 10 шт/нед", "Коробки удачи активны"];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { weeklyCarpCaught: 0, lastReset: Date.now() };
let withdrawRequests = []; 

const MIN_JACKPOT = 1000;
const SELL_PRICE = 2; 
const TAX_RATE = 0.05; 

// --- РАБОТА С ДАННЫМИ ---
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            jackpot = data.jackpot || { pool: MIN_JACKPOT, lastWinner: "Никто" };
            globalState = data.globalState || { weeklyCarpCaught: 0, lastReset: Date.now() };
            withdrawRequests = data.withdrawRequests || [];
        } catch(e) { console.error("Ошибка загрузки:", e); }
    }
}
function saveData() { 
    const dataToSave = { users, jackpot, globalState, withdrawRequests, lastSave: Date.now() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
}
loadData();

function addLog(m) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${m}`);
    serverEvents.unshift(m);
    if(logs.length > 20) logs.pop();
    if(serverEvents.length > 15) serverEvents.pop();
}

async function sendTgMessage(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text
        });
    } catch (e) { console.error("TG Send Error:", e.message); }
}

// --- ЕЖЕНЕДЕЛЬНЫЙ СБРОС ---
setInterval(() => {
    const now = Date.now();
    if (now - globalState.lastReset > 604800000) {
        globalState.weeklyCarpCaught = 0;
        globalState.lastReset = now;
        addLog("🌊 Лимит Золотых Карпов обновлен!");
    }
    saveData();
}, 60000);

// Функция начисления (Внедрение твоих условий)
function applyItem(u, item) {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const fortnight = 14 * 24 * 60 * 60 * 1000;

    if (item === 'vip_bait') u.buffs.bait = now + week;
    if (item === 'titan_rod_7') u.buffs.titan = now + week;
    if (item === 'hope_lake_7') u.buffs.hope = now + week;
    if (item === 'vip_status_14') u.buffs.vip = now + fortnight;
    
    if (item === 'myakish') u.buffs.myakish += 10;
    if (item === 'energy') u.energy = (u.buffs.vip > now) ? 100 : 50;
    if (item === 'repair') { u.dur = 100; }
}

// --- API ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();
    if (!userId) return res.status(400).json({ error: "No ID" });

    // Инициализация
    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, 
            energy: 50, dur: 100, total: 0, lastBonus: 0, lastUpdate: now,
            buffs: { titan: 0, hope: 0, vip: 0, bait: 0, myakish: 0 },
            stats: { boxes: 0, castsAsRef: 0, lastRest: 0 },
            referrer: payload?.refBy || null,
            isBanned: false
        };
    }

    const u = users[userId];
    if (u.isBanned && userId !== ADMIN_ID) return res.status(403).json({ error: "BANNED" });

    const isVip = u.buffs.vip > now;
    const hasTitan = u.buffs.titan > now || isVip;
    const maxEnergy = isVip ? 100 : 50;
    const currentWithdrawLimit = isVip ? 10000 : 30000;

    // Регенерация
    const passed = now - u.lastUpdate;
    if (passed > 300000 && !isVip) { 
        u.energy = Math.min(maxEnergy, u.energy + Math.floor(passed / 300000)); 
        u.lastUpdate = now; 
    } else if (isVip) { u.energy = 100; }

    let msg = ""; let catchData = null; let boxReward = null;

    switch (action) {
        case 'load': msg = "Данные загружены"; break;

        case 'cast':
            const lake = payload.lake || 'normal';
            if (!isVip && u.energy < 2) { msg = "Нет энергии!"; break; }
            if (!hasTitan && u.dur <= 0) { msg = "Почини удочку!"; break; }
            if (lake === 'hope' && u.buffs.hope < now) { msg = "Доступ закрыт!"; break; }
            
            // VIP Отдых 30 мин каждые 100 забросов
            if (isVip && u.total > 0 && u.total % 100 === 0) {
                if (now - u.stats.lastRest < 1800000) { msg = "Отдых 30 мин!"; break; }
                u.stats.lastRest = now;
            }

            if (!isVip) u.energy -= 2;
            if (!hasTitan) u.dur = Math.max(0, u.dur - 1);
            u.total++;
            u.stats.castsAsRef++;

            // Коробка Удачи за реферала
            if (u.referrer && u.stats.castsAsRef === 50) {
                if (users[u.referrer]) {
                    users[u.referrer].stats.boxes++;
                    sendTgMessage(u.referrer, "🎁 Твой реферал активен! Ты получил Коробку Удачи!");
                }
            }

            let weight = (Math.random() * 2 + 0.5);
            // Приманка x3 / x6
            const isGoldHour = new Date().getMinutes() < 10; 
            if (u.buffs.bait > now) weight *= isGoldHour ? 6 : 3;

            catchData = { type: "Рыба", w: weight.toFixed(2) + " кг" };
            u.fish += weight;

            if (lake === 'hope') {
                if (globalState.weeklyCarpCaught < 10 && Math.random() < 0.02) {
                    u.fish += (5000 / SELL_PRICE);
                    catchData = { type: "ЗОЛОТОЙ КАРП! 🏆", w: "5000 TC" };
                    globalState.weeklyCarpCaught++;
                } else if (Math.random() < 0.15) {
                    const bonus = 100 + Math.floor(Math.random()*200);
                    u.b += bonus;
                    catchData = { type: "Кошелек! 💰", w: `${bonus} TC` };
                }
            }
            break;

        case 'sell':
            const inc = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(inc * TAX_RATE);
            jackpot.pool += tax;
            u.b += (inc - tax);
            u.fish = 0;
            msg = `Продано! +${inc - tax} TC`;
            break;

        case 'open_box':
            if (u.stats.boxes <= 0) return res.json({ error: "Нет коробок" });
            u.stats.boxes--;
            const rnd = Math.random();
            let rid = 'myakish'; let rn = "Мякиш";
            if (rnd > 0.9) { rid = 'vip_status_14'; rn = "VIP СТАТУС"; }
            else if (rnd > 0.6) { rid = 'titan_rod_7'; rn = "Титановая удочка"; }
            applyItem(u, rid);
            boxReward = { id: rid, n: rn };
            msg = `Выпало: ${rn}!`;
            break;

        case 'buy':
            const item = payload.id;
            if (payload.tonConfirmed || userId === ADMIN_ID) {
                applyItem(u, item);
                msg = "Успешно!";
            } else if (item === 'repair' && u.b >= 50) {
                u.b -= 50; u.dur = 100; msg = "Починено!";
            }
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { msg = "Рано!"; }
            else { u.b += 100; u.energy = maxEnergy; u.lastBonus = now; msg = "Бонус 100 TC!"; }
            break;
            
        case 'get_top':
            const top = Object.values(users).sort((a,b) => b.b - a.b).slice(0,10).map(p => ({id: p.id, n: p.n, b: p.b}));
            return res.json({ topPlayers: top });
    }
    saveData();
    res.json({ ...u, maxEnergy, withdrawLimit: currentWithdrawLimit, msg, catchData, boxReward, jackpot, globalState });
});

app.listen(PORT, () => console.log(`TAMAC FISH 5.5.0`));
