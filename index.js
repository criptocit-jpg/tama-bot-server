const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ФАЙЛ БАЗЫ ДАННЫХ
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

// ЗАГРУЗКА ДАННЫХ
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log("База данных загружена успешно.");
    } catch (e) { users = {}; }
}

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));

// ЛОГИКА УРОВНЕЙ (на основе общей добычи)
const getLevel = (total) => {
    if (total > 500000) return "ПОСЕЙДОН 🔱";
    if (total > 150000) return "МОРСКОЙ ВОЛК 🐺";
    if (total > 50000) return "КАПИТАН 👨‍✈️";
    if (total > 15000) return "РЫБОЛОВ-ПРО 🎣";
    if (total > 5000) return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

// --- АДМИН-ПАНЕЛЬ (РЕЖИМ БОГА) ---
// Вызывать через POST: { "adminKey": "твой_ключ", "targetId": "ID", "action": "give_money", "value": 1000 }
app.post('/api/admin/power', (req, res) => {
    const { adminKey, targetId, action, value } = req.body;
    if (adminKey !== 'super_secret_key_777') return res.status(403).json({ error: 'Нет доступа' });

    const u = users[targetId];
    if (!u) return res.status(404).json({ error: 'Юзер не найден' });

    if (action === 'give_money') {
        u.b += parseFloat(value);
        u.totalEarned = (u.totalEarned || 0) + parseFloat(value);
    }
    if (action === 'ban') u.isBanned = true;
    if (action === 'unban') u.isBanned = false;
    
    saveDB();
    res.json({ success: true, user: u });
});

app.all('/api/action', async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    // Инициализация нового игрока
    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName, b: 100, energy: 50, boxes: 1, fish: 0,
            castCount: 0, durability: 100, totalEarned: 0, 
            lastBonus: 0, isBanned: false, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];
    if (u.isBanned) return res.json({ msg: "АККАУНТ ЗАБЛОКИРОВАН 🚫" });

    const now = Date.now();
    const isGoldHour = new Date().getHours() === 19; // Золотой час в 19:00 по серверу

    // Регенерация энергии
    if (now - u.lastUpdate > 600000) {
        u.energy = Math.min(100, u.energy + 2);
        u.lastUpdate = now;
        saveDB();
    }

    if (req.method === 'POST') {
        const { action, captchaPassed, itemId, wallet, amount } = req.body;

        // 1. ЛОГИКА РЫБАЛКИ
        if (action === 'catch_fish') {
            const isCaptcha = (u.castCount + 1) % 5 === 0;
            if (isCaptcha && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! 🛑' });
            
            if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
            if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

            u.energy -= 2;
            u.durability -= 1; // Обычный износ
            u.castCount++;

            // Шанс обрыва лески (5%)
            if (Math.random() < 0.05) {
                u.durability -= 5; // Сильный удар по прочности
                saveDB();
                return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! МИНУС ПРОЧНОСТЬ 💥' });
            }

            let weight = (Math.random() * 5 + 0.5);
            if (isGoldHour) weight *= 2;

            u.fish += weight;
            
            // Шанс ящика (3%)
            let msg = `ПОЙМАЛ: ${weight.toFixed(2)} КГ! 🎣`;
            if (Math.random() < 0.03) {
                u.boxes++;
                msg = `УЛОВ: ${weight.toFixed(2)} КГ + ЯЩИК! 🎁`;
            }

            saveDB();
            return res.json({ ...u, level: getLevel(u.totalEarned), msg });
        }

        // 2. ПРОДАЖА РЫБЫ
        if (action === 'sell_fish') {
            if (u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА!' });
            let money = u.fish * 10;
            u.b += money;
            u.totalEarned += money;
            u.fish = 0;
            saveDB();
            return res.json({ ...u, level: getLevel(u.totalEarned), msg: `ПОЛУЧЕНО: ${money.toFixed(0)} TC 💰` });
        }

        // 3. ЕЖЕДНЕВНЫЙ БОНУС
        if (action === 'get_daily') {
            if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: 'БОНУС ЕЩЕ НЕ ГОТОВ!' });
            u.b += 100;
            u.lastBonus = now;
            saveDB();
            return res.json({ ...u, msg: 'ПОЛУЧЕНО 100 TC! ✨' });
        }

        // 4. РЕМОНТ
        if (action === 'repair') {
            if (u.b < 50) return res.json({ ...u, msg: 'НУЖНО 50 TC!' });
            u.b -= 50;
            u.durability = 100;
            saveDB();
            return res.json({ ...u, msg: 'УДОЧКА ПОЧИНЕНА! 🛠️' });
        }

        // 5. МАГАЗИН
        if (action === 'buy_item') {
            const prices = { 'energy': 30, 'titan': 150 };
            if (u.b < prices[itemId]) return res.json({ ...u, msg: 'МАЛО TC НА БАЛАНСЕ!' });
            u.b -= prices[itemId];
            if (itemId === 'energy') u.energy += 30;
            saveDB();
            return res.json({ ...u, msg: 'ПОКУПКА ОФОРМЛЕНА!' });
        }

        // 6. ВЫВОД
        if (action === 'withdraw') {
            if (u.b < 30000) return res.json({ ...u, msg: 'МИНИМУМ 30,000 TC!' });
            u.b -= amount;
            saveDB();
            return res.json({ ...u, msg: 'ЗАЯВКА ПРИНЯТА!' });
        }
        
        // 7. ОТКРЫТИЕ ЯЩИКА
        if (action === 'open_box') {
            if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ!' });
            u.boxes -= 1;
            let prize = Math.floor(Math.random() * 5000) + 100;
            u.b += prize;
            u.totalEarned += prize;
            saveDB();
            return res.json({ ...u, msg: `В ЯЩИКЕ БЫЛО ${prize} TC!` });
        }
    }

    // ТОП 10
    const top = Object.values(users)
        .sort((a, b) => b.b - a.b)
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    res.json({ ...u, level: getLevel(u.totalEarned || 0), top });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Diamond 3.6.0 on port ${PORT}`));
