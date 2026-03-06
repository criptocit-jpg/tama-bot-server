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

const PRICES_TON = {
    'vip_bait': 1.0,        // Приманка (7 дней, x3 вес / x6 Золотой час)
    'titan_rod_7': 1.0,     // Титановая удочка (7 дней, нет поломок и срывов)
    'hope_lake_7': 2.0,     // Озеро Надежды (7 дней, Карпы + Кошельки)
    'vip_status_14': 3.0,   // VIP Статус (14 дней, лимит 10к, безлимит энергия, иконка)
    'myakish_100': 0.5,
    'energy_boost': 0.2,
    'hope_access': 1.0,
    'poacher_kit': 2.0,
    'titan_rod': 3.5,
    'vip_30': 10.0
};

let users = {};
let logs = ["Сервер 5.7.0: МОНОЛИТ ВОССТАНОВЛЕН (XP + CACHE)"];
let serverEvents = ["Админ-панель: Активна", "Золотые карпы: 10 шт/нед", "Система XP: OK"];
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

// [НОВОЕ] Формула уровня
function calcLevel(u) {
    if(!u.xp) u.xp = 0;
    u.level = Math.floor(u.xp / 100) + 1;
}

async function sendTgMessage(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text
        });
    } catch (e) { console.error("TG Send Error:", e.message); }
}

setInterval(() => {
    const now = Date.now();
    if (now - globalState.lastReset > 604800000) {
        globalState.weeklyCarpCaught = 0;
        globalState.lastReset = now;
        addLog("🌊 Лимит Золотых Карпов обновлен!");
    }
    saveData();
}, 60000);

function applyItem(u, item) {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const fortnight = 14 * 24 * 60 * 60 * 1000;

    if (item === 'vip_bait') u.buffs.bait = now + week;
    if (item === 'titan_rod_7') u.buffs.titan = now + week;
    if (item === 'hope_lake_7') u.buffs.hope = now + week;
    if (item === 'vip_status_14') u.buffs.vip = now + fortnight;
    
    if (item === 'energy_boost') { 
        u.energy = (u.buffs.vip > now) ? 100 : 50; 
        u.buffs.regenX2 = now + 3600000;
    }
    if (item === 'myakish_100') u.buffs.myakish += 100;
    if (item === 'hope_access') u.buffs.hope = Math.max(now, u.buffs.hope || 0) + (3 * 24 * 60 * 60 * 1000);
    if (item === 'poacher_kit') u.buffs.poacher = now + (24 * 60 * 60 * 1000);
    if (item === 'titan_rod') u.buffs.titan = now + week;
    if (item === 'vip_30') u.buffs.vip = now + (30 * 24 * 60 * 60 * 1000);
}

// --- API ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();
    if (!userId) return res.status(400).json({ error: "No ID" });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, 
            xp: 0, level: 1, // [НОВОЕ]
            energy: 50, dur: 100, total: 0, lastBonus: 0, lastUpdate: now,
            buffs: { titan: 0, hope: 0, vip: 0, bait: 0, myakish: 0, poacher: 0, regenX2: 0 },
            stats: { boxes: 0, castsAsRef: 0, lastRest: 0 },
            referrer: payload?.refBy || null,
            isBanned: false
        };
    }

    const u = users[userId];
    if (u.isBanned && userId.toString() !== ADMIN_ID) return res.status(403).json({ error: "BANNED" });

    const isVip = u.buffs.vip > now;
    const hasTitan = u.buffs.titan > now || isVip;
    const maxEnergy = isVip ? 100 : 50;
    const currentWithdrawLimit = isVip ? 10000 : 30000;

    const passed = now - u.lastUpdate;
    if (passed > 300000 && !isVip) { 
        let reg = Math.floor(passed / 300000);
        if (u.buffs.regenX2 > now) reg *= 2;
        u.energy = Math.min(maxEnergy, u.energy + reg); 
        u.lastUpdate = now; 
    } else if (isVip) { u.energy = 100; }

    let msg = ""; let catchData = null; let boxReward = null;

    switch (action) {
        case 'load': msg = "Данные загружены"; break;

        case 'cast':
            const lake = payload.lake || 'normal';
            if (!isVip && u.energy < 2) { msg = "Нет энергии!"; break; }
            if (!hasTitan && u.dur <= 0) { msg = "Почини удочку!"; break; }
            if (lake === 'hope' && u.buffs.hope < now) { msg = "Доступ к Озеру закрыт!"; break; }
            
            if (isVip && u.total > 0 && u.total % 100 === 0) {
                if (now - u.stats.lastRest < 1800000) { msg = "Отдых 30 мин (VIP)!"; break; }
                u.stats.lastRest = now;
            }

            if (!isVip) u.energy -= 2;
            if (!hasTitan) u.dur = Math.max(0, u.dur - 1);
            u.total++;
            u.stats.castsAsRef++;

            // [НОВОЕ] Опыт за заброс
            u.xp = (u.xp || 0) + 5;
            calcLevel(u);

            if (u.referrer && u.stats.castsAsRef === 50) {
                if (users[u.referrer]) {
                    users[u.referrer].stats.boxes++;
                    sendTgMessage(u.referrer, "🎁 Реферал активен! Получена Коробка Удачи!");
                }
            }

            let weight = (Math.random() * 2 + 0.5);
            const isGoldHour = new Date().getMinutes() < 10; 
            if (u.buffs.bait > now) weight *= isGoldHour ? 6 : 3;

            let rand = Math.random() * 100;
            if (!hasTitan && rand < 5 && u.buffs.myakish <= 0) {
                msg = "Срыв! 🐟"; 
            } else {
                catchData = { type: "Рыба", w: weight.toFixed(2) + " кг" };
                u.fish += weight;
                if(u.buffs.myakish > 0) u.buffs.myakish--;
                
                if (lake === 'hope') {
                    if (globalState.weeklyCarpCaught < 10 && Math.random() < 0.02) {
                        u.fish += (5000 / SELL_PRICE);
                        catchData = { type: "ЗОЛОТОЙ КАРП! 🏆", w: "5000 TC" };
                        globalState.weeklyCarpCaught++;
                        addLog(`${u.n} выловил КАРПА!`);
                    } else if (Math.random() < 0.15) {
                        const bonus = 100 + Math.floor(Math.random()*200);
                        u.b += bonus;
                        catchData = { type: "Кошелек! 💰", w: `${bonus} TC` };
                    }
                }
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "Садок пуст!"; break; }
            const income = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(income * TAX_RATE);
            jackpot.pool += tax;
            u.b += (income - tax);
            
            // [НОВОЕ] Опыт за продажу
            u.xp = (u.xp || 0) + Math.floor(u.fish * 10);
            calcLevel(u);

            u.fish = 0;
            msg = `Продано! +${income - tax} TC`;
            break;

        case 'open_box':
            if (u.stats.boxes <= 0) return res.json({ error: "Нет коробок" });
            u.stats.boxes--;
            const rnd = Math.random();
            let rid = 'myakish_100'; let rn = "Мякиш";
            if (rnd > 0.95) { rid = 'vip_status_14'; rn = "VIP СТАТУС (14д)"; }
            else if (rnd > 0.8) { rid = 'titan_rod_7'; rn = "Титановая удочка (7д)"; }
            else if (rnd > 0.6) { rid = 'vip_bait'; rn = "VIP Приманка (7д)"; }
            applyItem(u, rid);
            boxReward = { id: rid, n: rn };
            msg = `Выпало: ${rn}!`;
            break;

        case 'buy':
            const item = payload.id;
            const tPrice = PRICES_TON[item];
            if (payload.tonConfirmed) {
                applyItem(u, item);
                msg = `ОПЛАТА ПРИНЯТА! ${item} начислен!`;
                addLog(`${u.n} купил ${item}`);
                break;
            }
            if (item === 'repair' && u.b >= 50) { u.b -= 50; u.dur = 100; msg = "Починено!"; }
            else if (tPrice) {
                if (userId.toString() === ADMIN_ID) { applyItem(u, item); msg = `АДМИН: Выдано!`; }
                else {
                    msg = `Счет на ${tPrice} TON отправлен в ЛС!`;
                    sendTgMessage(userId, `🛍 Заказ: ${item}\n💰 Сумма: ${tPrice} TON\n🏦 MEMO: FISH_${userId}_${item}`);
                }
            }
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { msg = "Еще не время!"; }
            else { u.b += 100; u.energy = maxEnergy; u.lastBonus = now; msg = "Бонус 100 TC!"; }
            break;

        case 'withdraw_request':
            const am = parseInt(payload.amount);
            if (u.b < am || am < 500) { msg = "Ошибка суммы!"; }
            else {
                u.b -= am;
                withdrawRequests.push({ reqId: Date.now(), userId, n: u.n, amount: am, status: 'pending', date: new Date().toLocaleString() });
                msg = "Заявка отправлена!";
            }
            break;

        case 'get_top':
            const top = Object.values(users).sort((a,b) => b.b - a.b).slice(0,10).map(p => ({id: p.id, n: p.n, b: p.b}));
            return res.json({ topPlayers: top });

        case 'admin_get_all':
            if (userId.toString() !== ADMIN_ID) return res.status(403).end();
            res.json({ allUsers: Object.values(users), withdrawRequests, jackpot, globalState });
            return;

        case 'admin_user_op':
            if (userId.toString() !== ADMIN_ID) return res.status(403).end();
            const target = users[payload.targetId];
            if (!target) return res.json({ error: "Not found" });
            if (payload.op === 'add_money') target.b += parseInt(payload.val);
            if (payload.op === 'set_vip') target.buffs.vip = now + (payload.val * 86400000);
            if (payload.op === 'ban') target.isBanned = !target.isBanned;
            msg = "Действие выполнено!";
            break;

        case 'admin_confirm_payout':
            if (userId.toString() !== ADMIN_ID) return res.status(403).end();
            const rIdx = withdrawRequests.findIndex(r => r.reqId === payload.reqId);
            if (rIdx > -1) {
                const r = withdrawRequests[rIdx];
                sendTgMessage(r.userId, `✅ Выплата ${r.amount} TC отправлена!`);
                withdrawRequests.splice(rIdx, 1);
                msg = "Оплата подтверждена!";
            }
            break;
    }
    saveData();
    res.json({ 
        ...u, 
        isAdmin: userId.toString() === ADMIN_ID, // [НОВОЕ]
        maxEnergy, 
        withdrawLimit: currentWithdrawLimit, 
        msg, 
        catchData, 
        boxReward, 
        jackpot, 
        globalState, 
        events: serverEvents 
    });
});

app.listen(PORT, () => console.log(`TAMAC FISH 5.7.0 MONOLITH`));
