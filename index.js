/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - SERVER CORE v4.4.0 [ULTIMATE EDITION]
 * ============================================================================
 * ВНИМАНИЕ: Данный файл содержит полный код без сокращений. 
 * Сохранены все логгирования, проверки и структуры данных.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- [КОНФИГУРАЦИЯ СИСТЕМЫ] ---
const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

// Инициализация бота с расширенными логами
let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("---------------------------------------------------------");
    console.log("📡 СИСТЕМА: Telegram Bot успешно инициализирован.");
    console.log("📦 СТАТУС: Ожидание входящих запросов...");
    console.log("---------------------------------------------------------");
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ПРИ ЗАПУСКЕ БОТА:", error.message);
}

let users = {};

// --- [БАЗА ДАННЫХ И ХРАНЕНИЕ] ---
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log(`[DB] База данных успешно загружена. Активных игроков: ${Object.keys(users).length}`);
        } catch (err) {
            console.error("[DB] Ошибка парсинга базы данных:", err);
            users = {};
        }
    } else {
        console.log("[DB] Файл базы данных не найден. Создание новой базы...");
        users = {};
    }
}

const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (e) {
        console.error("[DB] Ошибка при сохранении данных:", e.message);
    }
};

loadDatabase();

// --- [ЛОГИКА РАНГОВ И УРОВНЕЙ] ---
// Сохранено полное дерево условий
const getLevel = (totalEarned) => {
    const score = totalEarned || 0;
    if (score >= 2000000) return "БОГ ОКЕАНОВ 🔱⚡";
    if (score >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (score >= 500000) return "МОРСКОЙ ВОЛК 🐺";
    if (score >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (score >= 150000) return "СТАРШИЙ ОФИЦЕР 🎖️";
    if (score >= 100000) return "КОМАНДОР 🎖️";
    if (score >= 75000) return "КАПИТАН 👨‍✈️";
    if (score >= 50000) return "ШТУРМАН 🧭";
    if (score >= 25000) return "БОЦМАН 📢";
    if (score >= 10000) return "МАТРОС 🚢";
    if (score >= 5000) return "ЮНГА ⚓";
    return "САЛАГА 🌱";
};

// --- [ОБРАБОТКА ТЕЛЕГРАМ СОБЫТИЙ] ---
if (bot) {
    // 1. ИСПРАВЛЕНИЕ: Кнопка Оплачено в админке
    bot.on('callback_query', (query) => {
        const data = query.data.split('_');
        const action = data[0];
        const targetId = data[1];
        const amount = data[2];

        if (action === 'pay') {
            bot.answerCallbackQuery(query.id, { text: "Выплата подтверждена!" });
            
            bot.editMessageText(query.message.text + "\n\n✅ СТАТУС: ОПЛАЧЕНО", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });

            bot.sendMessage(targetId, `🌟 **ВАША ВЫПЛАТА ИСПОЛНЕНА!**\n💰 Сумма: ${amount} TC\nКошелек пополнен. Спасибо за игру!`);
            console.log(`[ADMIN] Выплата ${amount} TC подтверждена для пользователя ${targetId}`);
        }
    });

    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        const text = msg.text;

        if (chatId === ADMIN_GROUP_ID && text) {
            if (text.startsWith('/stats')) {
                bot.sendMessage(chatId, `📊 Всего игроков: ${Object.keys(users).length}`);
            }
            if (text.startsWith('/give')) {
                const parts = text.split(' ');
                const targetId = parts[1];
                const amount = parseFloat(parts[2]);
                if (users[targetId]) {
                    users[targetId].b += amount;
                    saveDB();
                    bot.sendMessage(chatId, `✅ Начислено ${amount} TC игроку ${users[targetId].n}`);
                }
            }
        }
    });
}

// --- [ОСНОВНОЙ API ОБРАБОТЧИК] ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, itemId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    // Инициализация нового пользователя со всеми полями
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
            multiplier: 1,
            isVip: false,
            isInfiniteRod: false,
            lastUpdate: Date.now(),
            regDate: new Date().toISOString()
        };
        console.log(`[NEW USER] Зарегистрирован: ${userName} (${userId})`);
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();

    if (u.isBanned) {
        return res.json({ msg: "ДОСТУП ЗАПРЕЩЕН: АККАУНТ ЗАБЛОКИРОВАН 🚫", isBanned: true });
    }

    // Регенерация энергии (Логика сохранена)
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) {
        let recoveryRate = u.isVip ? 1.0 : 0.5;
        let maxEnergy = u.isVip ? 200 : 100;
        let gained = Math.floor(timePassed / 60000) * recoveryRate;
        u.energy = Math.min(maxEnergy, (u.energy || 0) + gained);
        u.lastUpdate = now;
    }

    // --- [ОБРАБОТКА ДЕЙСТВИЙ] ---
    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑', needsCaptcha: true });
        }
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0 && !u.isInfiniteRod) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        u.energy -= 2;
        if (!u.isInfiniteRod) u.durability -= 1;
        u.castCount++;

        // Шанс улова
        if (Math.random() < 0.15) {
            saveDB();
            return res.json({ ...u, msg: 'СОРВАЛОСЬ... 🌊' });
        }

        let weight = (Math.random() * 2.5 + 0.2);
        u.fish += weight;
        let resultMsg = `ПОЙМАНО: ${weight.toFixed(2)} КГ! 🎣`;

        if (Math.random() < 0.04) {
            u.boxes++;
            resultMsg += " +📦 ЯЩИК!";
        }

        saveDB();
        return res.json({ ...u, msg: resultMsg, level: getLevel(u.totalEarned) });
    }

    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: 'ВАША СУМКА ПУСТА! 🎒' });
        
        let pricePerKg = 2 * (u.multiplier || 1);
        let earned = Math.floor(u.fish * pricePerKg);
        
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        
        saveDB();
        return res.json({ ...u, msg: `УЛОВ ПРОДАН ЗА ${earned} TC! 💰`, level: getLevel(u.totalEarned) });
    }

    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({ ...u, msg: 'У ВАС НЕТ ЯЩИКОВ! 📦' });
        
        u.boxes--;
        const prizes = [150, 300, 500, 1000, 2500, 5000];
        const win = prizes[Math.floor(Math.random() * prizes.length)];
        
        u.b += win;
        u.totalEarned += win;
        saveDB();
        return res.json({ ...u, winAmount: win, msg: `В ЯЩИКЕ НАЙДЕНО: ${win} TC! ✨` });
    }

    if (action === 'buy_stars') {
        // Логика 6 товаров Stars
        switch(itemId) {
            case 'item_1': u.b += 5000; u.boxes += 5; break;
            case 'item_2': u.multiplier = 2; break;
            case 'item_3': u.b += 50000; u.energy = u.isVip ? 200 : 100; break;
            case 'item_4': u.isInfiniteRod = true; u.durability = 100; break;
            case 'item_5': u.boxes += 10; break;
            case 'item_6': u.isVip = true; u.energy = 200; break;
        }
        saveDB();
        return res.json({ ...u, msg: 'ПОКУПКА УСПЕШНО АКТИВИРОВАНА! ⭐️' });
    }

    if (action === 'withdraw') {
        let val = parseFloat(amount);
        if (val < 30000 || u.b < val) {
            return res.json({ ...u, msg: 'ОШИБКА: МИН. ВЫВОД 30.000 TC! ❌' });
        }
        
        u.b -= val;
        saveDB();
        
        if (bot) {
            bot.sendMessage(ADMIN_GROUP_ID, `💳 **НОВАЯ ЗАЯВКА НА ВЫВОД**\n\n👤 Игрок: ${u.n}\n🆔 ID: ${userId}\n💰 Сумма: ${val} TC\n🏦 Кошелек: ${wallet}`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "✅ ПОДТВЕРДИТЬ ОПЛАТУ", callback_data: `pay_${userId}_${val}` }
                    ]]
                }
            });
        }
        return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА В ОБРАБОТКУ! ✅' });
    }

    // Загрузка данных по умолчанию
    const topList = Object.values(users)
        .sort((a, b) => b.b - a.b)
        .slice(0, 10)
        .map(p => ({ n: p.n, b: p.b }));

    res.json({
        ...u,
        level: getLevel(u.totalEarned),
        top: topList
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    console.log(`🔗 API ENDPOINT: http://localhost:${PORT}/api/action`);
});
