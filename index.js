/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.2.1 [FULL MONOLITH]
 * ============================================================================
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- КОНФИГУРАЦИЯ ---
const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const bot = new TelegramBot(token, { polling: true });
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

let users = {};

// --- РАБОТА С БАЗОЙ ---
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
        } catch (err) {
            console.error("Ошибка чтения базы данных:", err);
            users = {};
        }
    }
}

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
    } catch (err) {
        console.error("Ошибка сохранения базы данных:", err);
    }
};

loadDatabase();

// --- ЛОГИКА УРОВНЕЙ ---
const getLevel = (totalEarned) => {
    const s = totalEarned || 0;
    if (s >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (s >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (s >= 50000) return "КАПИТАН 👨‍✈️";
    if (s >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// --- УВЕДОМЛЕНИЯ АДМИНУ ---
const notifyAdmin = (text) => {
    bot.sendMessage(ADMIN_GROUP_ID, `🛍️ **ОТЧЕТ ИЗ МАГАЗИНА**\n${text}`, { parse_mode: 'Markdown' });
};

// --- ГЛАВНЫЙ ОБРАБОТЧИК ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, itemId } = req.body;
    
    if (!userId) return res.status(400).json({ error: 'ID пользователя отсутствует' });

    // Инициализация нового игрока
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            n: userName || 'Рыбак',
            b: 100.0,
            energy: 50.0,
            fish: 0.0,
            boxes: 1,
            castCount: 0,
            durability: 100,
            totalEarned: 0,
            lastBonus: 0,
            isBanned: false,
            lastUpdate: Date.now(),
            referrals: 0,
            premium: false
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();

    if (u.isBanned) return res.json({ msg: "ДОСТУП ОГРАНИЧЕН 🚫" });

    // Регенерация энергии (0.5 единицы в минуту)
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) {
        const energyToAdd = Math.floor(timePassed / 60000) * 0.5;
        u.energy = Math.min(100, (u.energy || 0) + energyToAdd);
        u.lastUpdate = now;
        saveDB();
    }

    // --- ДЕЙСТВИЕ: ЗАБРОС ---
    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑' });
        }
        if (u.energy < 2) return res.json({ ...u, msg: 'МАЛО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        // Шанс неудачи 15%
        if (Math.random() < 0.15) {
            saveDB();
            return res.json({ ...u, msg: 'РЫБА СОРВАЛАСЬ... 🌊' });
        }

        let weight = (Math.random() * 2.5 + 0.3);
        u.fish += weight;
        
        // Шанс найти ящик 4%
        let foundBox = false;
        if (Math.random() < 0.04) {
            u.boxes++;
            foundBox = true;
        }

        saveDB();
        return res.json({ 
            ...u, 
            msg: foundBox ? `УЛОВ ${weight.toFixed(2)} КГ + 📦!` : `УЛОВ ${weight.toFixed(2)} КГ! 🎣` 
        });
    }

    // --- ДЕЙСТВИЕ: ПРОДАЖА РЫБЫ ---
    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: 'НЕЧЕГО ПРОДАВАТЬ! 🎒' });
        
        let earned = Math.floor(u.fish * 2); // НОВЫЙ КУРС 1кг = 2 TC
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        
        saveDB();
        notifyAdmin(`👤 ${u.n} (ID:${userId}) продал улов за ${earned} TC`);
        return res.json({ ...u, msg: `ПОЛУЧЕНО ${earned} TC! 💰` });
    }

    // --- ДЕЙСТВИЕ: МАГАЗИН TC ---
    if (action === 'buy_tc') {
        const items = {
            'myakish': { price: 150, name: 'Мякиш' },
            'snasti': { price: 300, name: 'Комплект снастей' },
            'energy_drink': { price: 450, name: 'Энергетик' },
            'nets': { price: 1000, name: 'Сети' }
        };

        const item = items[itemId];
        if (!item) return res.json({ ...u, msg: 'ТОВАР НЕ НАЙДЕН' });
        if (u.b < item.price) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО СРЕДСТВ! ❌' });

        u.b -= item.price;
        
        if (itemId === 'energy_drink') u.energy = Math.min(100, u.energy + 40);
        if (itemId === 'snasti') u.durability = Math.min(100, u.durability + 30);
        if (itemId === 'nets') {
            const extraFish = Math.random() * 10 + 5;
            u.fish += extraFish;
        }

        saveDB();
        notifyAdmin(`🛒 ${u.n} купил "${item.name}" за ${item.price} TC`);
        return res.json({ ...u, msg: `ВЫ КУПИЛИ: ${item.name}! ✅` });
    }

    // --- ДЕЙСТВИЕ: ПОЧИНКА ---
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'НУЖНО 50 TC! ❌' });
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА ОТРЕМОНТИРОВАНА! 🛠️' });
    }

    // --- ДЕЙСТВИЕ: ОТКРЫТИЕ ЯЩИКА ---
    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ! 📦' });
        u.boxes--;
        const prize = Math.floor(Math.random() * 451) + 50; // От 50 до 500 TC
        u.b += prize;
        u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, prize, msg: `ИЗ ЯЩИКА ВЫПАЛО ${prize} TC! ✨` });
    }

    // --- ДЕЙСТВИЕ: ЕЖЕДНЕВНЫЙ БОНУС ---
    if (action === 'get_daily') {
        if (now < (u.lastBonus || 0) + 86400000) {
            return res.json({ ...u, msg: 'БОНУС ЕЩЕ НЕ ГОТОВ! ⏳' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ВЫ ПОЛУЧИЛИ 100 TC! 🎁' });
    }

    // Топ игроков
    const top = Object.values(users)
        .sort((a, b) => b.b - a.b)
        .slice(0, 10)
        .map(p => ({ n: p.n, b: p.b }));

    res.json({ ...u, level: getLevel(u.totalEarned), top });
});

// Запуск сервера
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`--- TAMACOIN SERVER v4.2.1 START ---`);
});
