/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - ULTIMATE SERVER CORE v3.8.4
 * ============================================================================
 * ПЛАН: БОТ -> КОНТРАКТ -> БИРЖА -> МОТОЦИКЛ 🏍️
 * ----------------------------------------------------------------------------
 * ВНИМАНИЕ: ЭТОТ КОД ЯВЛЯЕТСЯ ФУНДАМЕНТОМ. 
 * НЕ СОКРАЩАТЬ, НЕ УДАЛЯТЬ КОММЕНТАРИИ И ЛОГИКУ.
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- КОНФИГУРАЦИЯ СИСТЕМЫ ---
// Вставь сюда полный токен из BotFather
const token = '522630:AAbiI7L3o48CEqFK0JuObIvCelcao9mzTBc'; 
const ADMIN_GROUP_ID = '-5110681605'; 

// Инициализация бота с обработкой ошибок
let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("---------------------------------------------------------");
    console.log("📡 СИСТЕМА: Бот-админка успешно подключен.");
    console.log(`📡 ГРУППА УПРАВЛЕНИЯ: ${ADMIN_GROUP_ID}`);
    console.log("---------------------------------------------------------");
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ БОТА:", error.message);
}

const app = express();

// Настройки Middlewares
app.use(cors());
app.use(express.json());

// --- БАЗА ДАННЫХ (ФАЙЛОВАЯ СИСТЕМА) ---
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

/**
 * ФУНКЦИЯ ЗАГРУЗКИ БАЗЫ ДАННЫХ
 * Выполняется при каждом перезапуске сервера на Render
 */
function loadDatabase() {
    console.log("📂 БД: Начинаю загрузку данных...");
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log(`✅ БД: Успешно загружено ${Object.keys(users).length} профилей.`);
        } catch (err) {
            console.error("❌ БД: Ошибка при чтении файла:", err);
            users = {};
        }
    } else {
        console.log("⚠️ БД: Файл не найден, инициализирую пустую базу.");
        users = {};
    }
}

/**
 * ФУНКЦИЯ СОХРАНЕНИЯ БАЗЫ ДАННЫХ
 * Вызывается после любого изменения баланса или инвентаря
 */
const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (err) {
        console.error("❌ БД: Ошибка при записи в файл:", err);
    }
};

// Первичный запуск загрузки
loadDatabase();

/**
 * СИСТЕМА РАНГОВ
 * Автоматически рассчитывает статус на основе totalEarned
 */
const getLevel = (total) => {
    const t = total || 0;
    if (t >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (t >= 500000) return "ПОСЕЙДОН 🌊";
    if (t >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (t >= 150000) return "МОРСКОЙ ВОЛК 🐺";
    if (t >= 50000) return "КАПИТАН 👨‍✈️";
    if (t >= 15000) return "РЫБОЛОВ-ПРО 🎣";
    if (t >= 5000) return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

/**
 * ============================================================================
 * 🤖 МОДУЛЬ АДМИНИСТРИРОВАНИЯ (TELEGRAM)
 * ============================================================================
 */
if (bot) {
    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        const text = msg.text;
        const userHandle = msg.from.username || msg.from.first_name;

        // Проверка: сообщение пришло из нашей админ-группы?
        if (chatId !== ADMIN_GROUP_ID) {
            // Если кто-то пишет боту в ЛС, игнорим или отвечаем (по желанию)
            return;
        }

        console.log(`[📩 ГРУППА] Сообщение от ${userHandle}: ${text}`);

        // КОМАНДА: give [userId] [amount]
        if (text && text.startsWith('give')) {
            const parts = text.split(' ');
            if (parts.length === 3) {
                const targetId = parts[1];
                const amount = parseFloat(parts[2]);

                if (users[targetId]) {
                    users[targetId].b += amount;
                    users[targetId].totalEarned += amount;
                    saveDB();
                    bot.sendMessage(chatId, `✅ Успешно! Начислено ${amount} TC игроку ${users[targetId].n} (ID: ${targetId}).`);
                    console.log(`[💰 ADMIN] ${userHandle} выдал ${amount} TC игроку ${targetId}`);
                } else {
                    bot.sendMessage(chatId, `❌ Ошибка: Игрок с ID ${targetId} не найден.`);
                }
            }
        }

        // КОМАНДА: ban [userId]
        if (text && text.startsWith('ban')) {
            const targetId = text.split(' ')[1];
            if (users[targetId]) {
                users[targetId].isBanned = true;
                saveDB();
                bot.sendMessage(chatId, `🚫 Игрок ${users[targetId].n} заблокирован.`);
            }
        }

        // КОМАНДА: status
        if (text === '/status') {
            const count = Object.keys(users).length;
            bot.sendMessage(chatId, `📊 Состояние сервера: ОНЛАЙН\n👥 Всего игроков: ${count}`);
        }
    });
}

/**
 * ============================================================================
 * 🌐 API ОБРАБОТЧИК (ОСНОВНАЯ ЛОГИКА ИГРЫ)
 * ============================================================================
 */
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId, wallet, amount, referrerId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Critical Error: userId missing' });
    }

    // --- ИНИЦИАЛИЗАЦИЯ ИГРОКА ---
    if (!users[userId]) {
        console.log(`[🆕 NEW] Регистрация: ${userName} (ID: ${userId})`);
        users[userId] = {
            id: userId,
            n: userName || 'Рыбак',
            b: 100,
            energy: 50,
            boxes: 1,
            fish: 0,
            castCount: 0,
            durability: 100,
            totalEarned: 0,
            lastBonus: 0,
            isBanned: false,
            referrer: referrerId || null,
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Проверка на бан
    if (u.isBanned) {
        return res.json({ msg: "ВАШ АККАУНТ ЗАБЛОКИРОВАН 🚫", isBanned: true });
    }

    const now = Date.now();
    const isGoldHour = new Date().getHours() === 19;

    // --- ПАССИВНАЯ РЕГЕНЕРАЦИЯ ---
    const timeDiff = now - (u.lastUpdate || now);
    if (timeDiff > 600000) { // Каждые 10 минут
        const energyGain = Math.floor(timeDiff / 600000) * 2;
        if (energyGain > 0) {
            u.energy = Math.min(100, (u.energy || 0) + energyGain);
            u.lastUpdate = now;
        }
    }

    // ------------------------------------------------------------------------
    // ДЕЙСТВИЯ (ACTIONS)
    // ------------------------------------------------------------------------

    // 1. ЛОВЛЯ РЫБЫ
    if (action === 'catch_fish') {
        // Проверка капчи (мешочек)
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК УПУЩЕН! 🛑' });
        }

        if (u.energy < 2) return res.json({ ...u, msg: 'МАЛО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        // Шанс неудачи
        if (Math.random() < 0.20) {
            saveDB();
            return res.json({ ...u, msg: 'ПУСТО... 🌊' });
        }

        // Вес рыбы
        let weight = (Math.random() * 2.5 + 0.2);
        if (isGoldHour) weight *= 2;

        u.fish += weight;
        let finalMsg = `УЛОВ: ${weight.toFixed(2)} КГ! 🎣`;

        // Шанс найти ящик
        if (Math.random() < 0.03) {
            u.boxes++;
            finalMsg += " + 🎁";
        }

        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: finalMsg });
    }

    // 2. ПРОДАЖА (КУРС 0.5 TC)
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА!' });

        const profit = Math.floor(u.fish * 0.5);
        u.b += profit;
        u.totalEarned += profit;

        // Реферальные 10%
        if (u.referrer && users[u.referrer]) {
            const refBonus = Math.floor(profit * 0.1);
            if (refBonus > 0) {
                users[u.referrer].b += refBonus;
                users[u.referrer].totalEarned += refBonus;
            }
        }

        u.fish = 0;
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: `ПРОДАНО ЗА ${profit} TC! 💰` });
    }

    // 3. РЕМОНТ (50 TC)
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'НУЖНО 50 TC!' });
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА ПОЧИНЕНА! 🛠️' });
    }

    // 4. ЕЖЕДНЕВНЫЙ БОНУС
    if (action === 'get_daily') {
        if (now - (u.lastBonus || 0) < 86400000) {
            return res.json({ ...u, msg: 'ЖДИТЕ 24 ЧАСА!' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ПОЛУЧЕНО 100 TC! 🎁' });
    }

    // 5. ОТКРЫТИЕ ЯЩИКА
    if (action === 'open_box') {
        if (!u.boxes || u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ!' });
        u.boxes--;
        const win = Math.floor(Math.random() * 700) + 100;
        u.b += win;
        u.totalEarned += win;
        saveDB();
        return res.json({ ...u, msg: `ВЫИГРЫШ: ${win} TC! ✨` });
    }

    // 6. ВЫВОД СРЕДСТВ
    if (action === 'withdraw') {
        const wAmount = parseFloat(amount);
        if (wAmount >= 30000 && u.b >= wAmount) {
            u.b -= wAmount;
            saveDB();
            if (bot) {
                const notify = `💳 ЗАЯВКА НА ВЫВОД:\n👤 Игрок: ${u.n}\n🆔 ID: ${userId}\n💰 Сумма: ${wAmount} TC\n🏦 Кошелек: ${wallet}`;
                bot.sendMessage(ADMIN_GROUP_ID, notify);
            }
            return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА! ✅' });
        }
        return res.json({ ...u, msg: 'ОШИБКА (МИН. 30к TC)!' });
    }

    // ФОРМИРОВАНИЕ ТОПА
    const topData = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(p => ({ n: p.n, b: p.b }));

    // Ответ по умолчанию (загрузка данных)
    res.json({
        ...u,
        level: getLevel(u.totalEarned),
        top: topData
    });
});

// --- СТАРТ СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("=========================================================");
    console.log(`🚀 СЕРВЕР ТАМАКОИН ЗАПУЩЕН НА ПОРТУ: ${PORT}`);
    console.log(`📅 ВРЕМЯ: ${new Date().toLocaleString()}`);
    console.log("=========================================================");
});
