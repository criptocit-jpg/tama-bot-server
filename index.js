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
const BOT_TOKEN = 'ТВОЙ_ТОКЕН'; 
const ADMIN_CHAT_ID = '-1005110681605'; 
const WITHDRAW_LIMIT = 30000;

let users = {};
let logs = ["Система TC запущена и готова к работе!"];

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { users = {}; }
    }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2)); }
loadData();

function addLog(m) {
    logs.unshift(`[${new Date().toLocaleTimeString()}] ${m}`);
    if (logs.length > 15) logs.pop();
}

// --- WEBHOOK ДЛЯ АДМИНКИ ---
app.post('/tg-webhook', async (req, res) => {
    const { message, callback_query } = req.body;
    if (callback_query) {
        const [action, tid, amt] = callback_query.data.split('_');
        if (action === 'paid') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: tid, text: `✅ Выплата ${amt} TC успешно проведена!` });
        }
        if (action === 'ban') {
            if (users[tid]) { users[tid].isBanned = true; saveData(); }
        }
        return res.sendStatus(200);
    }
    res.sendStatus(200);
});

// --- ГЛАВНАЯ ЛОГИКА ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, energy: 100, dur: 100,
            isBanned: false, lastBonus: 0, lastUpdate: now,
            buffs: { myakish: 0, license: false }
        };
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "ВЫ ЗАБАНЕНЫ", isBanned: true });

    let msg = "";
    let catchData = null;

    // Регенерация энергии (раз в 5 минут +1)
    if (now - u.lastUpdate > 300000) {
        u.energy = Math.min(100, u.energy + Math.floor((now - u.lastUpdate) / 300000));
        u.lastUpdate = now;
    }

    switch (action) {
        case 'load': break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) {
                msg = "Бонус еще не готов!";
            } else {
                const prize = 100;
                u.b += prize; u.energy = 100; u.lastBonus = now;
                msg = `Получено ${prize} TC!`;
                addLog(`${u.n} получил бонус`);
            }
            break;

        case 'cast':
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            if (u.dur <= 0) { msg = "Почини удочку!"; break; }
            u.energy -= 2; u.dur -= 1;
            
            const isLake = payload.location === 'hope_lake';
            const rnd = Math.random() * 100;

            if (isLake && u.buffs.license) {
                if (rnd < 0.5) {
                    u.b += 5000; catchData = { type: "🌟 ЗОЛОТОЙ КАРП", w: "5000 TC" };
                    addLog(`🔥 ${u.n} поймал ЗОЛОТОГО КАРПА!`);
                } else if (rnd < 3.0) {
                    let g = Math.floor(Math.random() * 300); u.b += g;
                    catchData = { type: "💰 КОШЕЛЕК", w: `${g} TC` };
                } else {
                    let w = (Math.random() * 6 + 1).toFixed(2); u.fish += parseFloat(w);
                    catchData = { type: "Озерная рыба", w: w };
                }
            } else {
                let w = (Math.random() * 2 + 0.1).toFixed(2); u.fish += parseFloat(w);
                catchData = { type: "Морская рыба", w: w };
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "Садок пуст!"; break; }
            const money = Math.floor(u.fish * 2.5);
            u.b += money; u.fish = 0;
            msg = `Продано на ${money} TC!`;
            break;

        case 'buy':
            const item = payload.id;
            const prices = { myakish: 100, repair: 50, energy: 50, license: 1000 };
            if (u.b < prices[item]) { msg = "Недостаточно TC!"; break; }
            
            u.b -= prices[item];
            if (item === 'myakish') u.buffs.myakish += 10;
            if (item === 'repair') u.dur = 100;
            if (item === 'energy') u.energy = 100;
            if (item === 'license') u.buffs.license = true;
            msg = "Успешно куплено!";
            addLog(`${u.n} купил ${item}`);
            break;

        case 'withdraw':
            const amt = parseInt(payload.sum);
            if (amt < WITHDRAW_LIMIT) { msg = `Минимум ${WITHDRAW_LIMIT} TC!`; break; }
            if (u.b < amt) { msg = "Недостаточно TC!"; break; }
            try {
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: ADMIN_CHAT_ID, text: `💰 ЗАЯВКА: ${u.n} (${u.id})\nСумма: ${amt} TC\nКошелек: ${payload.wallet}`,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[{text:"✅ Оплачено", callback_data:`paid_${u.id}_${amt}`},{text:"🚫 БАН", callback_data:`ban_${u.id}`}]] }
                });
                u.b -= amt; msg = "Заявка отправлена!";
            } catch (e) { msg = "Ошибка API"; }
            break;
    }

    saveData();
    res.json({ ...u, msg, catchData, logs });
});

app.listen(PORT, () => console.log(`Server started on ${PORT}`));
