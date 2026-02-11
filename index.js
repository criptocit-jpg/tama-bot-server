const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

// ЗАГРУЗКА БД
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { users = {}; }
}

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
const getLevel = (total) => {
    if (total > 500000) return "ПОСЕЙДОН 🔱";
    if (total > 100000) return "МОРСКОЙ ВОЛК 🐺";
    if (total > 50000) return "КАПИТАН 👨‍✈️";
    if (total > 10000) return "РЫБОЛОВ-ПРО 🎣";
    if (total > 3000) return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

// АДМИН-ПАНЕЛЬ (РЕЖИМ БОГА)
app.post('/api/admin/power', (req, res) => {
    const { adminKey, targetId, action, value } = req.body;
    if (adminKey !== 'твой_секретный_ключ_777') return res.status(403).json({ error: 'Access Denied' });

    const u = users[targetId];
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (action === 'give_money') u.b += parseFloat(value);
    if (action === 'ban') u.isBanned = true;
    if (action === 'unban') u.isBanned = false;
    
    saveDB();
    res.json({ success: true, user: u });
});

app.all('/api/action', async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName, b: 100, energy: 50, boxes: 1, fish: 0,
            castCount: 0, durability: 100, totalEarned: 0, 
            lastBonus: 0, isBanned: false, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "ВЫ ЗАБАНЕНЫ ЗА ПОДОЗРИТЕЛЬНУЮ АКТИВНОСТЬ! 🚫" });

    const now = Date.now();
    const isGoldHour = new Date().getHours() === 19; // Золотой час в 19:00

    if (req.method === 'POST') {
        const { action, captchaPassed, itemId } = req.body;

        if (action === 'catch_fish') {
            const isCaptcha = (u.castCount + 1) % 5 === 0;
            if (isCaptcha && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! 🛑' });
            if (u.energy < 2) return res.json({ ...u, msg: 'Нет энергии! ⚡' });
            if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! НУЖЕН РЕМОНТ! 🛠️' });

            u.energy -= 2;
            u.durability -= 1; // Износ удочки
            u.castCount++;

            // Шанс обрыва лески (5%)
            if (Math.random() < 0.05) {
                u.durability -= 5;
                return res.json({ ...u, msg: 'ЛЕКА ОБОРВАЛАСЬ! МИНУС ПРОЧНОСТЬ! 💥' });
            }

            let weight = (Math.random() * 5 + 0.5);
            if (isGoldHour) weight *= 2; // Х2 в золотой час

            u.fish += weight;
            
            // Уменьшил шанс ящика до 3% (чтобы не было слишком много)
            let boxFound = false;
            if (Math.random() < 0.03) { u.boxes++; boxFound = true; }

            saveDB();
            return res.json({ 
                ...u, 
                level: getLevel(u.totalEarned),
                msg: boxFound ? `РЫБА: ${weight.toFixed(2)}кг + ЯЩИК! 🎁` : `РЫБА: ${weight.toFixed(2)}кг 🎣`,
                isGold: isGoldHour
            });
        }

        if (action === 'sell_fish') {
            if (u.fish <= 0) return res.json({ ...u, msg: 'Садок пуст' });
            let money = u.fish * 10;
            u.b += money;
            u.totalEarned += money;
            u.fish = 0;
            saveDB();
            return res.json({ ...u, level: getLevel(u.totalEarned), msg: `ПРОДАНО НА ${money.toFixed(0)} TC!` });
        }

        if (action === 'get_daily') {
            if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: 'БОНУС ЕЩЕ НЕ ГОТОВ!' });
            u.b += 100;
            u.lastBonus = now;
            saveDB();
            return res.json({ ...u, msg: 'ЕЖЕДНЕВНЫЙ БОНУС 100 TC ПОЛУЧЕН! 💰' });
        }

        if (action === 'repair') {
            if (u.b < 50) return res.json({ ...u, msg: 'Нужно 50 TC для ремонта!' });
            u.b -= 50; u.durability = 100;
            saveDB();
            return res.json({ ...u, msg: 'УДОЧКА КАК НОВАЯ! 🛠️' });
        }
        
        // РЕАЛЬНЫЕ ПОКУПКИ
        if (action === 'buy_item') {
            const prices = { 'energy': 30, 'titan': 150 };
            if (u.b < prices[itemId]) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC!' });
            u.b -= prices[itemId];
            if (itemId === 'energy') u.energy += 30;
            saveDB();
            return res.json({ ...u, msg: 'ПОКУПКА УСПЕШНА!' });
        }
    }

    res.json({ ...u, level: getLevel(u.totalEarned || 0), isGold: isGoldHour });
});

app.listen(3000);
