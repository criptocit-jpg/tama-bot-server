const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- НАСТРОЙКИ (ВСТАВЬ СВОИ ДАННЫЕ) ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_CHAT_ID = '-5110681605'; 

let users = {};
let logs = ["Сервер Tamacoin запущен!"];

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) { users = {}; }
    }
}
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}
loadData();

function addLog(m) {
    logs.unshift(`[${new Date().toLocaleTimeString()}] ${m}`);
    if (logs.length > 10) logs.pop();
}

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "No user ID" });

    // Инициализация пользователя
    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, s: 0,
            fish: 0, energy: 100, dur: 100,
            buffs: { myakish: 0, gear: 0, titan: 0, bait: 0, strong: 0, license: false },
            total: 0, lastBonus: 0, lastUpdate: now, boxes: 0
        };
    }

    const u = users[userId];
    let msg = "";
    let catchData = null;

    // Регенерация энергии (раз в 5 минут)
    const passed = now - u.lastUpdate;
    if (passed > 300000) {
        const recovery = Math.floor(passed / 300000);
        u.energy = Math.min(100, u.energy + recovery);
        u.lastUpdate = now;
    }

    switch (action) {
        case 'load':
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) {
                msg = "Бонус еще не готов!";
            } else {
                const prize = 50 + Math.floor(Math.random() * 50);
                u.b += prize;
                u.energy = 100;
                u.lastBonus = now;
                msg = `Получено ${prize} TC и ⚡ Энергия!`;
                addLog(`${u.n} забрал бонус`);
            }
            break;

        case 'cast':
            if (u.energy < 2) { msg = "Нет энергии! ⚡"; break; }
            if (u.dur <= 0) { msg = "Почини удочку! 🛠️"; break; }
            u.energy -= 2;
            u.dur -= (u.buffs.titan > now) ? 0.5 : 1;
            
            let rand = Math.random() * 100;
            if (rand < 5 && u.buffs.myakish <= 0) { 
                msg = "Срыв рыбы! 🐟"; 
            } else if (rand < 7.5 && u.buffs.strong < now) { 
                u.dur -= 5; 
                msg = "Обрыв лески! 🪝"; 
            } else {
                let w = (Math.random() * 3 + 0.5) * (u.buffs.bait > now ? 2 : 1);
                if (new Date().getHours() === 19) w *= 2;
                u.fish += w;
                if (u.buffs.myakish > 0) u.buffs.myakish--;
                catchData = { type: "Рыба", w: w.toFixed(2) };
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "Садок пуст!"; break; }
            const money = Math.floor(u.fish * 2);
            u.b += money; 
            u.fish = 0;
            msg = `Продано на ${money} TC!`;
            break;

        case 'buy':
            const item = payload.id;
            const prices = { 
                myakish: 100, gear: 200, energy: 50, repair: 50,
                titan: 150, bait: 200, strong: 200, license: 500 
            };
            if (u.b < prices[item]) { msg = "Недостаточно TC!"; break; }
            u.b -= prices[item];
            const h = 3600000;
            if (item === 'myakish') u.buffs.myakish += 10;
            if (item === 'energy') u.energy = 100;
            if (item === 'repair') u.dur = 100;
            if (item === 'gear') u.buffs.gear = now + (24 * h);
            if (item === 'titan') u.buffs.titan = now + (12 * h);
            if (item === 'bait') u.buffs.bait = now + (3 * h);
            if (item === 'strong') u.buffs.strong = now + (24 * h);
            if (item === 'license') u.buffs.license = true;
            msg = "Покупка успешна!";
            addLog(`${u.n} купил ${item}`);
            break;

        case 'withdraw':
            const { wallet, sum } = payload;
            if (!wallet || sum < 10) { msg = "Мин. 10 TC и кошелек!"; break; }
            if (u.b < sum) { msg = "Недостаточно TC!"; break; }
            u.b -= sum;
            msg = "Заявка отправлена!";
            try {
                const text = `💰 **НОВАЯ ЗАЯВКА**\n👤: ${u.n} (${u.id})\n💵: ${sum} TC\n👛: \`${wallet}\``;
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: ADMIN_CHAT_ID,
                    text: text,
                    parse_mode: 'Markdown'
                });
                addLog(`Вывод: ${u.n} (${sum} TC)`);
            } catch (e) { console.error("API Error:", e.message); }
            break;
    }

    saveData();
    const top = Object.values(users).sort((a,b)=>b.b-a.b).slice(0,10).map(x=>({n:x.n, b:x.b}));
    res.json({ ...u, msg, catchData, top, logs });
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));

