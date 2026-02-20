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
let logs = ["Система готова к выпуску токена!"];

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

// --- ОБРАБОТКА КОМАНД ИЗ TELEGRAM (Webhook) ---
app.post('/tg-webhook', async (req, res) => {
    const { message, callback_query } = req.body;

    // Обработка кнопок "Оплачено" и "Забанить"
    if (callback_query) {
        const adminId = callback_query.from.id;
        const [action, targetId, amount] = callback_query.data.split('_');
        const target = users[targetId];

        if (action === 'paid') {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: targetId,
                text: `✅ Ваша заявка на ${amount} TC одобрена! Средства отправлены.`
            });
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: "Уведомление отправлено" });
        }

        if (action === 'ban') {
            if (target) {
                target.isBanned = true;
                saveData();
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: "Игрок ЗАБАНЕН" });
            }
        }
        return res.sendStatus(200);
    }

    // Обработка текстовых команд /give и /ban
    if (message && message.text) {
        const txt = message.text;
        if (txt.startsWith('/give')) {
            const [_, tid, sum] = txt.split(' ');
            if (users[tid]) {
                users[tid].b += parseInt(sum);
                saveData();
                axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_CHAT_ID, text: `💰 Игроку ${tid} выдано ${sum} TC` });
            }
        }
        if (txt.startsWith('/ban')) {
            const [_, tid] = txt.split(' ');
            if (users[tid]) {
                users[tid].isBanned = true;
                saveData();
                axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_CHAT_ID, text: `🚫 Игрок ${tid} ЗАБАНЕН` });
            }
        }
    }
    res.sendStatus(200);
});

// --- ГЛАВНАЯ ЛОГИКА ИГРЫ ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, 
            fish: 0, energy: 100, dur: 100, isBanned: false,
            buffs: { myakish: 0, license: false, echo: 0, flash: 0 },
            lastUpdate: now
        };
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "ВЫ ЗАБАНЕНЫ ЗА ФЕРМЕРСТВО", isBanned: true });

    let msg = "";
    let catchData = null;

    switch (action) {
        case 'load': break;

        case 'withdraw':
            const amt = parseInt(payload.sum);
            if (amt < WITHDRAW_LIMIT) { msg = `Минимальный вывод от ${WITHDRAW_LIMIT} TC!`; break; }
            if (u.b < amt) { msg = "Недостаточно TC!"; break; }

            try {
                const text = `⚠️ <b>ЗАЯВКА НА ВЫВОД</b>\n\n👤 Игрок: ${u.n} (ID: <code>${u.id}</code>)\n💵 Сумма: <b>${amt} TC</b>\n👛 Кошелек: <code>${payload.wallet}</code>`;
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: ADMIN_CHAT_ID,
                    text: text,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ Оплачено", callback_data: `paid_${u.id}_${amt}` }],
                            [{ text: "🚫 ЗАБАНИТЬ", callback_data: `ban_${u.id}` }]
                        ]
                    }
                });
                u.b -= amt;
                msg = "Заявка отправлена админу!";
                addLog(`Заявка: ${u.n} на ${amt} TC`);
            } catch (e) { msg = "Ошибка очереди. Попробуйте позже."; }
            break;

       case 'cast':
            if (u.energy < 2) { msg = "⚡ Нет энергии!"; break; }
            if (u.dur <= 0) { msg = "🛠️ Удочка сломана!"; break; }

            u.energy -= 2;
            u.dur -= 1;
            u.lastUpdate = now;

            let isLake = payload.location === 'hope_lake';
            let chance = Math.random() * 100;
            
            // Логика Озера Надежды
            if (isLake) {
                if (chance < 0.5) { // Золотой Карп
                    u.b += 5000;
                    catchData = { type: "🌟 ЗОЛОТОЙ КАРП", w: "5000 TC" };
                    addLog(`🔥 ${u.n} поймал Золотого Карпа!`);
                } else if (chance < 3.0) { // Утерянный кошелек
                    let gift = Math.floor(Math.random() * 301);
                    u.b += gift;
                    catchData = { type: "💰 КОШЕЛЕК", w: `${gift} TC` };
                } else { // Обычная рыба x2
                    let w = (Math.random() * 5 + 1).toFixed(2);
                    u.fish += parseFloat(w);
                    catchData = { type: "Озерная рыба", w: w };
                }
            } else {
                // Обычное море
                let w = (Math.random() * 2 + 0.1).toFixed(2);
                u.fish += parseFloat(w);
                catchData = { type: "Морская рыба", w: w };
            }
            break;

        case 'sell':
            const income = Math.floor(u.fish * 2.5);
            u.b += income; u.fish = 0;
            msg = `Продано на ${income} TC!`;
            break;
    }

    saveData();
    res.json({ ...u, msg, catchData, logs });
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));

