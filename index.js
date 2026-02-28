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

let users = {};
let logs = ["Сервер 5.0.0: GOD MODE активирован!"];
let serverEvents = ["Админ-панель запущена", "Озеро Надежды активно!"];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { weeklyCarpCaught: 0, lastReset: Date.now() };
let withdrawRequests = []; // Очередь на вывод

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
            buffs: { titan: false, poacher: 0, hope: 0, vip: 0, myakish: 0 },
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
    const withdrawalTime = isVip ? "1 час" : "24 часа";

    // Регенерация
    const passed = now - u.lastUpdate;
    if (passed > 300000) { 
        u.energy = Math.min(maxEnergy, u.energy + Math.floor(passed / 300000)); 
        u.lastUpdate = now; 
    }

    switch (action) {
        case 'load':
            msg = "Данные загружены";
            break;

        case 'cast':
            const lake = payload.lake || 'normal';
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            if (u.dur <= 0 && !u.buffs.titan) { msg = "Почини удочку!"; break; }
            if (lake === 'hope' && (!u.buffs.hope || u.buffs.hope < now)) {
                msg = "Купи доступ к Озеру Надежды!"; break;
            }
            u.energy -= 2;
            if (!u.buffs.titan) u.dur = Math.max(0, u.dur - 1);
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
                    let carpChance = (u.buffs.poacher > now) ? 0.5 : 0.01;
                    if (globalState.weeklyCarpCaught < 10 && (Math.random() * 100) < carpChance) {
                        const carpTC = 5000; 
                        u.fish += (carpTC / SELL_PRICE);
                        catchData = { type: "ЗОЛОТОЙ КАРП! 🏆", w: "5000 TC (эквив.)" };
                        globalState.weeklyCarpCaught++;
                        addLog(`${u.n} выловил КАРПА!`);
                    } else if (Math.random() < 0.03) {
                        const walletTC = 100 + Math.floor(Math.random() * 201);
                        u.b += walletTC;
                        catchData = { type: "Забытый кошелек 💰", w: walletTC + " TC" };
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
            if (item === 'repair' && u.b >= 50) { u.b -= 50; u.dur = 100; msg = "Починено!"; }
            if (item === 'energy' && u.b >= 50) { u.b -= 50; u.energy = maxEnergy; msg = "Заряжен!"; }
            if (item === 'myakish' && u.b >= 100) { u.b -= 100; u.buffs.myakish += 10; msg = "Куплено!"; }
            if (item === 'vip_7') { u.buffs.vip = now + (7 * 24 * 60 * 60 * 1000); u.energy = 100; msg = "VIP активен!"; }
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
            const amount = parseInt(payload.amount);
            if (u.b < amount || amount < 500) { msg = "Ошибка суммы!"; }
            else {
                u.b -= amount;
                withdrawRequests.push({ 
                    reqId: Date.now(), userId, n: u.n, amount, status: 'pending', date: new Date().toLocaleString() 
                });
                msg = "Заявка отправлена админу!";
            }
            break;

        case 'get_top':
            const topPlayers = Object.values(users)
                .sort((a, b) => b.b - a.b)
                .slice(0, 10)
                .map(p => ({ id: p.id, n: p.n, b: p.b }));
            return res.json({ topPlayers });

        // --- ADMIN GOD MODE ---
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
            const reqIdx = withdrawRequests.findIndex(r => r.reqId === payload.reqId);
            if (reqIdx > -1) {
                const r = withdrawRequests[reqIdx];
                r.status = 'paid';
                sendTgMessage(r.userId, `✅ Ваша выплата на сумму ${r.amount} TC одобрена и отправлена!`);
                withdrawRequests.splice(reqIdx, 1); // Убираем из списка после оплаты
                msg = "Выплата подтверждена!";
            }
            break;
    }

    saveData();
    res.json({ ...u, maxEnergy, withdrawLimit: currentWithdrawLimit, msg, catchData, jackpot, events: serverEvents });
});

app.listen(PORT, () => console.log(`[GOD MODE] Tamacoin 5.0.0 на порту ${PORT}`));
