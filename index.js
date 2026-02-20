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
const BOT_TOKEN = '8053883928:AAEyg0jnUZaHFVFnrEJH_C86A3caz6P0gu0'; 
const ADMIN_CHAT_ID = '7883085758'; 
const WITHDRAW_LIMIT = 30000;

let users = {};
let logs = ["Система готова. Удачной рыбалки!"];

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

// --- ОБРАБОТКА WEBHOOK ---
app.post('/tg-webhook', async (req, res) => {
    const { callback_query } = req.body;
    if (callback_query) {
        const [action, tid, val] = callback_query.data.split('_');
        if (action === 'givev' && users[tid]) {
            if (val === 'license') users[tid].buffs.license = true;
            if (val === 'echo') users[tid].buffs.echo = 100;
            saveData();
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: tid, text: `🎉 Покупка ${val} активирована!` });
        }
        if (action === 'ban' && users[tid]) {
            users[tid].isBanned = true;
            saveData();
        }
    }
    res.sendStatus(200);
});

// --- API ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, energy: 100, dur: 100,
            isBanned: false, lastBonus: 0, lastUpdate: now,
            buffs: { myakish: 0, license: false, echo: 0 }
        };
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "ВЫ ЗАБАНЕНЫ", isBanned: true });

    // Регенерация энергии
    const passed = Math.floor((now - u.lastUpdate) / 60000);
    if (passed > 0) {
        u.energy = Math.min(100, u.energy + passed);
        u.lastUpdate = now;
    }

    let msg = "";
    let catchData = null;

    switch (action) {
        case 'load': break;

        case 'get_top':
            const top = Object.values(users)
                .sort((a, b) => b.b - a.b)
                .slice(0, 10)
                .map(p => ({ n: p.n, b: Math.floor(p.b) }));
            return res.json({ top });

        case 'get_daily':
            if (now - u.lastBonus < 86400000) msg = "Заходите завтра!";
            else { u.b += 100; u.energy = 100; u.lastBonus = now; msg = "Бонус получен!"; }
            break;

        case 'cast':
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            u.energy -= 2; u.dur -= 1;
            const isLake = payload.location === 'hope_lake';
            if (isLake && !u.buffs.license) { msg = "Нужна лицензия!"; break; }
            
            let weight = (isLake ? (Math.random() * 5 + 2) : (Math.random() * 2 + 0.1)).toFixed(2);
            u.fish += parseFloat(weight);
            catchData = { type: isLake ? "Озерная рыба" : "Морская рыба", w: weight + " кг" };
            break;

        case 'sell':
            const sum = Math.floor(u.fish * 2.5);
            u.b += sum; u.fish = 0; msg = `Продано за ${sum} TC`;
            break;

        case 'request_buy':
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: `🛒 ПОКУПКА: ${u.n} (${u.id})\nТовар: ${payload.id}`,
                reply_markup: { inline_keyboard: [[{text:"Выдать", callback_data:`givev_${u.id}_${payload.id}`}]] }
            });
            msg = "Запрос отправлен админу!";
            break;

        case 'buy_tc':
            if (payload.id === 'repair' && u.b >= 50) { u.b -= 50; u.dur = 100; msg = "Починено!"; }
            break;
    }

    saveData();
    res.json({ ...u, msg, catchData, logs });
});

app.listen(PORT, () => console.log(`Server started` ));
