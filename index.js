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
const ADMIN_CHAT_ID = '7883085758'; 
const WITHDRAW_LIMIT = 30000;

let users = {};
let logs = ["Система Tamacoin запущена! Ждем первых уловов."];

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

// --- ОБРАБОТКА КОМАНД И КНОПОК ИЗ ТЕЛЕГРАМ ---
app.post('/tg-webhook', async (req, res) => {
    const { callback_query } = req.body;
    if (callback_query) {
        const [action, tid, val] = callback_query.data.split('_');
        const target = users[tid];

        if (!target) return res.sendStatus(200);

        if (action === 'paid') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: tid, text: `✅ Выплата ${val} TC подтверждена!` });
        }

        if (action === 'ban') {
            target.isBanned = true;
            saveData();
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: "Игрок забанен" });
        }

        if (action === 'givev') {
            if (val === 'license') target.buffs.license = true;
            if (val === 'echo') target.buffs.echo = 100;
            saveData();
            addLog(`🌟 ${target.n} активировал ${val}!`);
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: tid, text: `🎉 Покупка активирована! Предмет "${val}" теперь у вас.` });
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: "Предмет выдан!" });
        }
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
            buffs: { myakish: 0, license: false, echo: 0 }
        };
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "ВЫ ЗАБАНЕНЫ", isBanned: true });

    let msg = "";
    let catchData = null;

    switch (action) {
        case 'load': break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { msg = "Бонус будет завтра!"; }
            else { u.b += 100; u.energy = 100; u.lastBonus = now; msg = "+100 TC!"; addLog(`${u.n} взял бонус`); }
            break;

        case 'cast':
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            if (u.dur <= 0) { msg = "Почини удочку!"; break; }
            u.energy -= 2; u.dur -= 1;
            
            let isLake = payload.location === 'hope_lake';
            let rnd = Math.random() * 100;

            if (isLake && u.buffs.license) {
                if (rnd < 1) { u.b += 5000; catchData = { type: "🌟 ЗОЛОТОЙ КАРП", w: "5000 TC" }; addLog(`🔥 ${u.n} поймал КАРПА!`); }
                else { let w = (Math.random() * 6 + 2).toFixed(2); u.fish += parseFloat(w); catchData = { type: "Озерная рыба", w: w }; }
            } else {
                let w = (Math.random() * 2 + 0.1).toFixed(2); u.fish += parseFloat(w); catchData = { type: "Рыба", w: w };
            }
            break;

        case 'sell':
            let m = Math.floor(u.fish * 2.5); u.b += m; u.fish = 0; msg = `Получено ${m} TC`;
            break;

        case 'request_buy':
            const item = payload.id;
            const prices = { license: "1 TON", echo: "0.5 TON" };
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: `💎 <b>ЗАПРОС ПОКУПКИ</b>\n\nИгрок: ${u.n} (<code>${u.id}</code>)\nТовар: ${item}\nЦена: ${prices[item]}`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{text:"✅ Выдать", callback_data:`givev_${u.id}_${item}`}, {text:"❌ Отклонить", callback_data:`rej` }]] }
            });
            msg = "Запрос отправлен! Ожидайте активации после оплаты.";
            break;

        case 'buy_tc': // Покупки за игровые монеты
            if (payload.id === 'repair' && u.b >= 50) { u.b -= 50; u.dur = 100; msg = "Удочка как новая!"; }
            else if (payload.id === 'energy' && u.b >= 50) { u.b -= 50; u.energy = 100; msg = "Энергия полна!"; }
            else { msg = "Недостаточно TC!"; }
            break;

        case 'withdraw':
            if (u.b < payload.sum || payload.sum < WITHDRAW_LIMIT) { msg = "Ошибка суммы!"; break; }
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: `💰 <b>ВЫВОД</b>\nИгрок: ${u.n}\nСумма: ${payload.sum}\nКошелек: ${payload.wallet}`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{text:"✅ Оплачено", callback_data:`paid_${u.id}_${payload.sum}`}, {text:"🚫 БАН", callback_data:`ban_${u.id}`}]] }
            });
            u.b -= payload.sum; msg = "Заявка принята!";
            break;
    }
    saveData();
    res.json({ ...u, msg, catchData, logs });
});

app.listen(PORT, () => console.log(`Server started on ${PORT}`));
