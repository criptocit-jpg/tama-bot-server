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

// ЦЕНЫ В TON ДЛЯ МАГАЗИНА
const PRICES_TON = {
    'myakish_100': 0.5,
    'energy_boost': 0.2,
    'hope_access': 1.0,
    'poacher_kit': 2.0,
    'titan_rod': 3.5,
    'vip_30': 10.0
};

let users = {};
let logs = ["Сервер 5.1.0: ВОССТАНОВЛЕНИЕ ПОЛНОГО КОДА ЗАВЕРШЕНО"];
let serverEvents = ["Админ-панель активна", "Система TON Connect интегрирована"];
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

// Функция начисления (Ювелирная работа)
function applyItem(u, item) {
    const now = Date.now();
    if (item === 'energy_boost') { 
        u.energy = (u.buffs.vip > now) ? 100 : 50; 
        u.buffs.regenX2 = now + 3600000;
    }
    if (item === 'myakish_100') u.buffs.myakish += 100;
    if (item === 'hope_access') u.buffs.hope = Math.max(now, u.buffs.hope || 0) + (3 * 24 * 60 * 60 * 1000);
    if (item === 'poacher_kit') u.buffs.poacher = now + (24 * 60 * 60 * 1000);
    if (item === 'titan_rod') u.buffs.titan = now + (7 * 24 * 60 * 60 * 1000);
    if (item === 'vip_30') u.buffs.vip = now + (30 * 24 * 60 * 60 * 1000);
}

// --- API ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();
    if (!userId) return res.status(400).json({ error: "No ID" });

    // Инициализация юзера
    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, 
            energy: 50, dur: 100, total: 0, lastBonus: 0, lastUpdate: now,
            buffs: { titan: false, poacher: 0, hope: 0, vip: 0, myakish: 0, regenX2: 0 },
            stats: { withdrawLimit: 30000, priority: false },
            isBanned: false
        };
    }

    const u = users[userId];
    if (u.isBanned && userId !== ADMIN_ID) return res.status(403).json({ error: "BANNED" });

    let msg = "";
    let catchData = null;

    const isVip = u.buffs.vip > now;
    const maxEnergy = isVip ? 100 : 50;
    const currentWithdrawLimit = isVip ? 10000 : 30000;

    // Регенерация
    const passed = now - u.lastUpdate;
    if (passed > 300000) { 
        let reg = Math.floor(passed / 300000);
        if (u.buffs.regenX2 > now) reg *= 2;
        u.energy = Math.min(maxEnergy, u.energy + reg); 
        u.lastUpdate = now; 
    }

    switch (action) {
        case 'load':
            msg = "Данные загружены";
            break;

        case 'cast':
            const lake = payload.lake || 'normal';
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            if (u.dur <= 0 && (!u.buffs.titan || u.buffs.titan < now)) { msg = "Почини удочку!"; break; }
            if (lake === 'hope' && (!u.buffs.hope || u.buffs.hope < now)) {
                msg = "Купи доступ к Озеру Надежды!"; break;
            }
            u.energy -= 2;
            if (!u.buffs.titan || u.buffs.titan < now) u.dur = Math.max(0, u.dur - 1);
            u.total++;
            let rand = Math.random() * 100;
            if (rand < 5 && (!u.buffs.myakish || u.buffs.myakish <= 0)) {
                msg = "Срыв! 🐟"; 
            } else {
                let weight = (Math.random() * 3 + 0.5);
                catchData = { type: "Обычная рыба", w: weight.toFixed(2) + " кг" };
                u.fish += weight;
                if(u.buffs.myakish > 0) u.buffs.myakish--;
                if (lake === 'hope') {
                    let carpChance = (u.buffs.poacher > now) ? 2.5 : 0.5;
                    if (globalState.weeklyCarpCaught < 10 && (Math.random() * 100) < carpChance) {
                        u.fish += (5000 / SELL_PRICE);
                        catchData = { type: "ЗОЛОТОЙ КАРП! 🏆", w: "5000 TC (эквив.)" };
                        globalState.weeklyCarpCaught++;
                        addLog(`${u.n} выловил КАРПА!`);
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
            u.fish = 0;
            msg = `Продано! +${income - tax} TC (Налог ${tax})`;
            break;

        case 'buy':
            const item = payload.id;
            const tPrice = PRICES_TON[item];
            
            // Логика автооплаты через фронтенд
            if (payload.tonConfirmed) {
                applyItem(u, item);
                msg = `Успешно приобретено: ${item}!`;
                addLog(`${u.n} купил ${item} через TON`);
                break;
            }

            if (item === 'repair' && u.b >= 50) { 
                u.b -= 50; u.dur = 100; msg = "Починено!"; 
            } else if (tPrice) {
                if (userId === ADMIN_ID) {
                    applyItem(u, item);
                    msg = `АДМИН: ${item} начислен!`;
                } else {
                    // Старая логика счета в ЛС (как резерв)
                    msg = `Счет на ${tPrice} TON отправлен в ЛС бота!`;
                    sendTgMessage(userId, `🛍 Оплата заказа: ${item}\n💰 Сумма: ${tPrice} TON`);
                }
            } else { msg = "Не хватает TC или товар не за TON!"; }
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { msg = "Еще не время!"; }
            else {
                const p = 50 + Math.floor(Math.random()*50);
                u.b += p; u.energy = maxEnergy; u.lastBonus = now;
                msg = `Бонус ${p} TC!`;
            }
            break;

        case 'withdraw_request':
            const am = parseInt(payload.amount);
            if (u.b < am || am < 500) { msg = "Ошибка суммы!"; }
            else {
                u.b -= am;
                withdrawRequests.push({ reqId: Date.now(), userId, n: u.n, amount: am, status: 'pending', date: new Date().toLocaleString() });
                msg = "Заявка отправлена админу!";
            }
            break;

        case 'get_top':
            const topPlayers = Object.values(users).sort((a, b) => b.b - a.b).slice(0, 10).map(p => ({ id: p.id, n: p.n, b: p.b }));
            return res.json({ topPlayers });

        case 'admin_get_all':
            if (userId !== ADMIN_ID) return res.status(403).end();
            res.json({ allUsers: Object.values(users), withdrawRequests, jackpot });
            return;

        case 'admin_user_op':
            if (userId !== ADMIN_ID) return res.status(403).end();
            const target = users[payload.targetId];
            if (!target) return res.json({ error: "Not found" });
            if (payload.op === 'add_money') target.b += parseInt(payload.val);
            if (payload.op === 'set_vip') target.buffs.vip = now + (payload.val * 86400000);
            if (payload.op === 'ban') target.isBanned = !target.isBanned;
            msg = "Действие выполнено!";
            break;

        case 'admin_confirm_payout':
            if (userId !== ADMIN_ID) return res.status(403).end();
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
    res.json({ ...u, maxEnergy, withdrawLimit: currentWithdrawLimit, msg, catchData, jackpot, events: serverEvents, globalState });
});

app.listen(PORT, () => console.log(`[GOD MODE] Tamacoin 5.1.0 MONOLITH на порту ${PORT}`));
