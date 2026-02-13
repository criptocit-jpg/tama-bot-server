const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios'); // Для отправки заявок в ТГ

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- НАСТРОЙКИ АДМИНКИ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; // Замени на свой
const ADMIN_CHAT_ID = '-5110681605'; // Замени на свой айди

let users = {};
let logs = ["Добро пожаловать в Tamacoin Fishing!"];

function loadData() {
    if (fs.existsSync(DATA_FILE)) users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}
loadData();

// --- ВСПОМОГАТЕЛЬНОЕ ---
function addLog(m) {
    logs.unshift(`[${new Date().toLocaleTimeString()}] ${m}`);
    if (logs.length > 10) logs.pop();
}

app.get('/', (req, res) => res.send("Server is alive!"));

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName, b: 100, s: 0,
            fish: 0, energy: 100, dur: 100,
            buffs: { myakish: 0, gear: 0, titan: 0, bait: 0, strong: 0, license: false },
            total: 0, lastBonus: 0, lastUpdate: now
        };
        addLog(`Новый рыбак: ${userName}`);
    }

    const u = users[userId];
    let msg = "";
    let catchData = null;

    // Реген энергии (1 ед в 5 мин)
    const passed = now - u.lastUpdate;
    if (passed > 300000) {
        u.energy = Math.min(100, u.energy + Math.floor(passed / 300000));
        u.lastUpdate = now;
    }

    switch (action) {
        case 'cast':
            if (u.energy < 2) { msg = "Нет энергии! ⚡"; break; }
            if (u.dur <= 0) { msg = "Удочка сломана! 🛠️"; break; }

            u.energy -= 2;
            u.dur -= (u.buffs.titan > now) ? 0.5 : 1;

            let rand = Math.random() * 100;
            // Шансы (с учетом баффов)
            const hasMyakish = u.buffs.myakish > 0;
            const hasStrong = u.buffs.strong > now;
            const hasBait = u.buffs.bait > now;

            if (rand < 5 && !hasMyakish) {
                msg = "Эх, сорвалась! 🐟";
            } else if (rand < 7.5 && !hasStrong) {
                u.dur -= 5;
                msg = "Обрыв лески! 🪝";
            } else {
                let w = (Math.random() * 3 + 0.5) * (hasBait ? 2 : 1);
                const hour = new Date().getHours();
                if (hour === 19) w *= 2; // Золотой час

                let type = "Карась";
                if (u.buffs.license) {
                    if (Math.random() < 0.005) { type = "ЗОЛОТОЙ КАРП"; w = 2500; }
                    else if (Math.random() < 0.01) { type = "ЯЩИК 📦"; w = 0; u.b += 500; }
                }

                u.fish += w;
                if (hasMyakish) u.buffs.myakish--;
                catchData = { type, w: w.toFixed(2) };
                addLog(`${u.n} поймал ${type} (${w.toFixed(2)}кг)`);
            }
            break;

        case 'sell':
            const money = Math.floor(u.fish * 2);
            u.b += money; u.total += money; u.fish = 0;
            msg = `Продано на ${money} TC!`;
            break;

        case 'buy':
            const item = payload.id;
            const prices = { myakish: 100, gear: 200, energy: 50, repair: 50 };
            const starPrices = { titan: 150, bait: 200, strong: 200, license: 500 };

            if (prices[item] && u.b >= prices[item]) {
                u.b -= prices[item];
                if (item === 'myakish') u.buffs.myakish += 5;
                if (item === 'gear') u.buffs.gear = now + 86400000;
                if (item === 'energy') u.energy = Math.min(100, u.energy + 10);
                if (item === 'repair') u.dur = 100;
                msg = "Покупка успешна!";
            } else if (starPrices[item] && u.s >= starPrices[item]) {
                u.s -= starPrices[item];
                if (item === 'titan') u.buffs.titan = now + (7 * 86400000);
                if (item === 'bait') u.buffs.bait = now + (7 * 86400000);
                if (item === 'strong') u.buffs.strong = now + (7 * 86400000);
                if (item === 'license') u.buffs.license = true;
                msg = "VIP предмет активирован!";
            } else { msg = "Недостаточно средств!"; }
            break;

        case 'withdraw':
            const { wallet, sum } = payload;
            if (u.b < sum || sum < 100) { msg = "Ошибка суммы!"; break; }
            u.b -= sum;
            msg = "Заявка отправлена!";
            // Отправка админу
            const text = `💰 ВЫВОД\nИгрок: ${u.n}\nID: ${u.id}\nКошелек: ${wallet}\nСумма: ${sum} TC`;
            axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: text,
                reply_markup: { inline_keyboard: [[{ text: "✅ Оплачено", callback_data: `paid_${u.id}` }]] }
            });
            break;
    }

    saveData();
    const top = Object.values(users).sort((a,b)=>b.b-a.b).slice(0,10).map(x=>({n:x.n, b:x.b}));
    res.json({ ...u, msg, catchData, top, logs });
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
