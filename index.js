/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING - SERVER v4.2.3 [FULL MONOLITH]
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// КОНФИГУРАЦИЯ
const token = '8449158911:AAHoIGP7_MwhHG--gyyFi (truncated for safety)'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const DB_FILE = path.join(__dirname, 'database.json');

let users = {};

const app = express();
app.use(cors());
app.use(express.json());

let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("🚀 МОНОЛИТ 4.2.3: СЕРВЕР ЗАПУЩЕН");
} catch (e) { 
    console.error("Ошибка инициализации бота:", e.message); 
}

// РАБОТА С БАЗОЙ ДАННЫХ
function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try { 
            users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); 
        } catch (e) { 
            console.error("Ошибка чтения базы:", e);
            users = {}; 
        }
    }
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
loadDB();

// СИСТЕМА УРОВНЕЙ (ЗОЛОТАЯ БАЗА)
const getLevel = (exp) => {
    const s = exp || 0;
    if (s >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (s >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (s >= 50000) return "КАПИТАН 👨‍✈️";
    if (s >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// ОБРАБОТКА КОМАНД ИЗ АДМИН-ГРУППЫ
if (bot) {
    bot.on('message', (m) => {
        if (m.chat.id.toString() !== ADMIN_GROUP_ID) return;
        
        // Команда give [id] [amount]
        if (m.text && m.text.startsWith('give')) {
            const parts = m.text.split(' ');
            const targetId = parts[1];
            const amount = parseFloat(parts[2]);
            
            if (users[targetId]) {
                users[targetId].b += amount;
                users[targetId].totalEarned += amount;
                saveDB();
                bot.sendMessage(ADMIN_GROUP_ID, `💰 Игроку ${users[targetId].n} (ID: ${targetId}) зачислено ${amount} TC`);
                bot.sendMessage(targetId, `🌟 Админ зачислил вам ${amount} TC!`);
            } else {
                bot.sendMessage(ADMIN_GROUP_ID, `❌ Пользователь с ID ${targetId} не найден.`);
            }
        }
    });

    bot.on('callback_query', (q) => {
        const [action, tid, amt] = q.data.split('_');
        if (action === 'pay') {
            bot.editMessageText(`✅ Выплата ${amt} TC игроку ${tid} ПОДТВЕРЖДЕНА`, {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id
            });
            bot.sendMessage(tid, `✅ Ваша выплата ${amt} TC успешно проведена!`);
        }
    });
}

// ОСНОВНОЕ API
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, itemId, captchaPassed } = req.body;
    if (!userId) return res.status(400).send("User ID required");

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
            durability: 100.0,
            totalEarned: 0.0,
            lastBonus: 0,
            lastUpdate: Date.now(),
            location: 'lake',
            inventory: { oil: 0, bread: 0, contract: false }
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии (фоновая)
    const timeDiff = now - (u.lastUpdate || now);
    if (timeDiff > 60000) {
        let recoveryRate = u.inventory.contract ? 0.8 : 0.5; // С контрактом быстрее
        u.energy = Math.min(100, (u.energy || 0) + (Math.floor(timeDiff / 60000) * recoveryRate));
        u.lastUpdate = now;
    }

    // ЛОГИКА РЫБАЛКИ
    if (action === 'catch_fish') {
        // Проверка капчи
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑 Поймай его!', level: getLevel(u.totalEarned) });
        }

        // Проверка ресурсов
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡', level: getLevel(u.totalEarned) });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️', level: getLevel(u.totalEarned) });

        // Расход ресурсов
        u.energy -= 2;
        let wear = u.inventory.oil > 0 ? 0.5 : 1.2; 
        u.durability = Math.max(0, u.durability - wear);
        if (u.inventory.oil > 0) u.inventory.oil--;
        u.castCount++;

        let weight = 0;
        let message = "";

        if (u.location === 'sea') {
            if (Math.random() < 0.005) { // Шанс на Золотого Карпа
                u.b += 5000;
                u.totalEarned += 5000;
                message = "🏆 ЛЕГЕНДАРНЫЙ ЗОЛОТОЙ КАРП! (+5000 TC)";
            } else {
                weight = Math.random() * 8.5 + 1.5;
                u.fish += weight;
                message = `🌊 МОРЕ: +${weight.toFixed(2)} кг`;
            }
        } else {
            if (Math.random() < 0.15 && u.inventory.bread <= 0) {
                message = "🌊 СОРВАЛАСЬ...";
            } else {
                weight = Math.random() * 2.5 + 0.1;
                u.fish += weight;
                if (u.inventory.bread > 0) u.inventory.bread--;
                message = `🎣 УЛОВ: +${weight.toFixed(2)} кг`;
            }
        }

        // Шанс на ящик
        if (Math.random() < 0.04) {
            u.boxes++;
            message += " +📦 НАЙДЕН ЯЩИК!";
        }

        saveDB();
        return res.json({ ...u, msg: message, level: getLevel(u.totalEarned) });
    }

    // ПРОДАЖА РЫБЫ (ИСПРАВЛЕНО)
    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: "СУМКА ПУСТА!" });
        
        let pricePerKg = 15; // Базовая цена
        let earned = Math.floor(u.fish * pricePerKg);
        if (u.inventory.contract) earned = Math.floor(earned * 1.2);
        
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        
        saveDB();
        return res.json({ ...u, msg: `💰 РЫБА ПРОДАНА ЗА ${earned} TC!`, level: getLevel(u.totalEarned) });
    }

    // ОТКРЫТИЕ ЯЩИКА (ИСПРАВЛЕНО: prize передается четко)
    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({ ...u, msg: "НЕТ ЯЩИКОВ!" });
        
        u.boxes--;
        const prizeAmount = Math.floor(Math.random() * 401) + 100; // От 100 до 500 TC
        u.b += prizeAmount;
        u.totalEarned += prizeAmount;
        
        saveDB();
        return res.json({ 
            ...u, 
            prize: prizeAmount, 
            msg: `📦 В ЯЩИКЕ ОКАЗАЛОСЬ ${prizeAmount} TC!`, 
            level: getLevel(u.totalEarned) 
        });
    }

    // МАГАЗИН
    if (action === 'buy_tc') {
        const prices = { bread: 50, oil: 150, meal: 800 };
        if (u.b < prices[itemId]) return res.json({ ...u, msg: "НЕДОСТАТОЧНО СРЕДСТВ!" });
        
        u.b -= prices[itemId];
        if (itemId === 'bread') u.inventory.bread += 5;
        if (itemId === 'oil') u.inventory.oil += 12;
        if (itemId === 'meal') u.energy = 100;
        
        saveDB();
        return res.json({ ...u, msg: "✅ ПОКУПКА УСПЕШНА", level: getLevel(u.totalEarned) });
    }

    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: "НУЖНО 50 TC ДЛЯ РЕМОНТА!" });
        u.b -= 50;
        u.durability = 100.0;
        saveDB();
        return res.json({ ...u, msg: "🛠️ УДОЧКА ОТРЕМОНТИРОВАНА", level: getLevel(u.totalEarned) });
    }

    // ЗАГРУЗКА ДАННЫХ
    res.json({ ...u, level: getLevel(u.totalEarned) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 СЕРВЕР РАБОТАЕТ НА ПОРТУ ${PORT}`);
});
