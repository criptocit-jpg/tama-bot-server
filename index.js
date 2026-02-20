const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- ТВОИ ДАННЫЕ ВШИТЫ ---
const BOT_TOKEN = '8053883928:AAEyg0jnUZaHFVFnrEJH_C86A3caz6P0gu0'; 
const ADMIN_CHAT_ID = '7883085758'; 
const WITHDRAW_LIMIT = 30000;

let users = {};
let logs = ["Добро пожаловать в Tamacoin Fishing!"];

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

app.post('/tg-webhook', async (req, res) => {
    const { callback_query } = req.body;
    if (callback_query) {
        const [action, tid, val] = callback_query.data.split('_');
        if (action === 'givev' && users[tid]) {
            if (val === 'license') users[tid].buffs.license = true;
            saveData();
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { 
                chat_id: tid, 
                text: `🎉 VIP Лицензия активирована! Озеро Надежды открыто.` 
            });
        }
    }
    res.sendStatus(200);
});

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, energy: 100, dur: 100,
            isBanned: false, lastBonus: 0, lastUpdate: now,
            buffs: { license: false }
        };
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "ВЫ ЗАБАНЕНЫ", isBanned: true });

    // Регенерация энергии (1 ед. в 5 минут)
    const passed = Math.floor((now - u.lastUpdate) / 300000);
    if (passed > 0) {
        u.energy = Math.min(100, u.energy + passed);
        u.lastUpdate = now;
    }

    let msg = "";
    let catchData = null;

    switch (action) {
        case 'load': break;
        case 'get_top':
            const top = Object.values(users).sort((a,b)=>b.b-a.b).slice(0,10).map(p=>({n:p.n, b:Math.floor(p.b)}));
            return res.json({ top });
        case 'get_daily':
            if (now - u.lastBonus < 86400000) msg = "Бонус еще не готов!";
            else { u.b += 150; u.energy = 100; u.lastBonus = now; msg = "Бонус +150 TC получен!"; addLog(`${u.n} взял бонус.`); }
            break;
        case 'cast':
            if (u.energy < 2) { msg = "⚡ Мало энергии!"; break; }
            u.energy -= 2; u.dur -= 1;
            const isL = payload.location === 'hope_lake';
            if (isL && !u.buffs.license) { msg = "🔒 Купите лицензию в магазине!"; break; }
            
            let weight = (isL ? (Math.random()*7+3) : (Math.random()*2+0.2)).toFixed(2);
            u.fish += parseFloat(weight);
            catchData = { type: isL ? "🌟 Озерный Карп" : "Морской Окунь", w: weight + " кг" };
            addLog(`${u.n} поймал ${weight} кг.`);
            break;
        case 'sell':
            const s = Math.floor(u.fish * 3); u.b += s; u.fish = 0; msg = `Продано на ${s} TC!`;
            break;
        case 'request_buy':
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: `💎 ЗАПРОС VIP: ${u.n} (ID: ${u.id})`,
                reply_markup: { inline_keyboard: [[{text:"✅ Выдать лицензию", callback_data:`givev_${u.id}_license`}]] }
            });
            msg = "Запрос отправлен! Ожидайте.";
            break;
        case 'repair':
            if (u.b >= 50) { u.b -= 50; u.dur = 100; msg = "Снасти в порядке!"; } else { msg = "Мало TC!"; }
            break;
    }
    saveData();
    res.json({ ...u, msg, catchData, logs, serverTime: now });
});

app.listen(PORT, () => console.log(`Server started`));
