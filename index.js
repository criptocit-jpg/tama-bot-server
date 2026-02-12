/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.3.0 [ULTIMATE MONOLITH]
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("📡 СИСТЕМА: Ядро v4.3.0 запущено.");
} catch (error) {
    console.error("❌ ОШИБКА БОТА:", error.message);
}

let users = {};

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (err) { users = {}; }
    }
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
loadDatabase();

const getLevel = (earned) => {
    if (earned >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (earned >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (earned >= 50000) return "КАПИТАН 👨‍✈️";
    if (earned >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// --- API ACTION HANDLER ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, itemId } = req.body;
    if (!userId) return res.status(400).json({ error: 'No ID' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100, energy: 50, fish: 0,
            boxes: 1, castCount: 0, durability: 100, totalEarned: 0,
            lastBonus: 0, isBanned: false, multiplier: 1, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) {
        u.energy = Math.min(100, (u.energy || 0) + (Math.floor(timePassed / 60000) * 0.5));
        u.lastUpdate = now;
    }

    // ЛОГИКА ДЕЙСТВИЙ
    switch(action) {
        case 'catch_fish':
            if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑' });
            if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
            if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

            u.energy -= 2; u.durability -= 1; u.castCount++;
            if (Math.random() < 0.2) return res.json({ ...u, msg: 'ПУСТО... 🌊' });

            let weight = (Math.random() * 2.5 + 0.2);
            u.fish += weight;
            if (Math.random() < 0.03) u.boxes++;
            break;

        case 'sell_fish':
            if (u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА! 🎒' });
            let pricePerKg = 2 * (u.multiplier || 1);
            let earned = Math.floor(u.fish * pricePerKg);
            u.b += earned; u.totalEarned += earned; u.fish = 0;
            saveDB();
            return res.json({ ...u, msg: `ПРОДАНО НА ${earned} TC! 💰` });

        case 'get_daily':
            if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: 'ЕЩЕ НЕ ВРЕМЯ! ⏳' });
            u.b += 100; u.lastBonus = now;
            break;

        case 'buy_tc': // Покупки за TC
            const prices = { 'myakish': 150, 'snasti': 300, 'energy_drink': 450, 'nets': 1000 };
            if (u.b < prices[itemId]) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО TC! ❌' });
            u.b -= prices[itemId];
            if (itemId === 'myakish') u.castCount = 0;
            if (itemId === 'snasti') u.durability = Math.min(100, u.durability + 50);
            if (itemId === 'energy_drink') u.energy = Math.min(100, u.energy + 40);
            if (itemId === 'nets') {
                let catchNet = Math.floor(Math.random() * 10) + 5;
                u.fish += catchNet;
                return res.json({ ...u, msg: `СЕТИ ПРИНЕСЛИ ${catchNet} КГ! 🕸️` });
            }
            break;

        case 'repair':
            if (u.b < 50) return res.json({ ...u, msg: 'МАЛО TC! ❌' });
            u.b -= 50; u.durability = 100;
            break;

        case 'open_box':
            if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ! 📦' });
            u.boxes--;
            let prize = Math.floor(Math.random() * 450) + 50;
            u.b += prize; u.totalEarned += prize;
            break;

        case 'withdraw':
            if (amount < 30000 || u.b < amount) return res.json({ ...u, msg: 'ОШИБКА ВЫВОДА! ❌' });
            u.b -= amount;
            bot.sendMessage(ADMIN_GROUP_ID, `💳 ВЫВОД: ${u.n}\nСумма: ${amount}\nКошелек: ${wallet}`);
            return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА! ✅' });
    }

    saveDB();
    const top = Object.values(users).sort((a,b) => b.b - a.b).slice(0, 10).map(p => ({n: p.n, b: p.b}));
    res.json({ ...u, level: getLevel(u.totalEarned), top });
});

app.listen(3000, () => console.log("🚀 SERVER ON 3000"));
