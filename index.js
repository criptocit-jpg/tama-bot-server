/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - ULTIMATE SERVER CORE v3.8.1
 * ============================================================================
 * ЦЕЛЬ: ЗАПУСК -> СМАРТ-КОНТРАКТ -> БИРЖА -> МОТОЦИКЛ 🏍️
 * ----------------------------------------------------------------------------
 * ДАННЫЙ КОД ЯВЛЯЕТСЯ "ЗОЛОТЫМ ФУНДАМЕНТОМ". 
 * НИКОГДА НЕ СОКРАЩАТЬ И НЕ УДАЛЯТЬ ЛОГИКУ.
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- ИНИЦИАЛИЗАЦИЯ БОТА ---
// Токен из твоего запроса
const token = '522630:AAbiI7L3o48CEqFK0JuObIvCelcao9mzTBc'; 
const bot = new TelegramBot(token, { polling: true });

const app = express();

// --- НАСТРОЙКИ MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- РАБОТА С БАЗОЙ ДАННЫХ ---
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

/**
 * ФУНКЦИЯ ЗАГРУЗКИ ДАННЫХ ИЗ ФАЙЛА
 * Вызывается один раз при старте сервера
 */
function loadDatabase() {
    console.log("---------------------------------------------------------");
    console.log("🔄 СИСТЕМА: Запуск процесса загрузки базы данных...");
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log(`✅ УСПЕХ: Загружено ${Object.keys(users).length} активных профилей.`);
        } catch (err) {
            console.error("❌ ОШИБКА: Не удалось прочитать database.json:", err);
            users = {};
        }
    } else {
        console.log("⚠️ ПРЕДУПРЕЖДЕНИЕ: database.json не найден. Создаем новую БД.");
        users = {};
    }
    console.log("---------------------------------------------------------");
}

/**
 * ФУНКЦИЯ СОХРАНЕНИЯ ДАННЫХ
 * Вызывается после каждого важного изменения (продажа, покупка, улов)
 */
const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (err) {
        console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ЗАПИСИ БД:", err);
    }
};

loadDatabase();

/**
 * СИСТЕМА РАНГОВ И УРОВНЕЙ
 * Основана на общей сумме заработанных TC за всё время
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
 * 🤖 МОДУЛЬ АДМИНИСТРИРОВАНИЯ ЧЕРЕЗ TELEGRAM-ГРУППУ
 * ============================================================================
 */
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Логируем все входящие в консоль сервера для отладки
    if (text) {
        console.log(`[ГРУППА ${chatId}] Сообщение от @${msg.from.username || 'unknown'}: ${text}`);
    }

    // Узнать ID чата (группы)
    if (text === '/get_id' || text === '!id') {
        bot.sendMessage(chatId, `🆔 ID этого чата: ${chatId}`);
    }

    // КОМАНДА НАЧИСЛЕНИЯ: give [id] [amount]
    if (text && text.startsWith('give')) {
        const parts = text.split(' ');
        if (parts.length === 3) {
            const targetId = parts[1];
            const amount = parseFloat(parts[2]);

            if (users[targetId]) {
                users[targetId].b += amount;
                users[targetId].totalEarned += amount;
                saveDB();
                bot.sendMessage(chatId, `💰 Шеф, начислил ${amount} TC игроку ${users[targetId].n} (ID: ${targetId}). Баланс обновлен!`);
                console.log(`[ADMIN] Выдано ${amount} TC пользователю ${targetId}`);
            } else {
                bot.sendMessage(chatId, `❌ Ошибка: Игрок с ID ${targetId} не найден в базе.`);
            }
        }
    }

    // КОМАНДА БАНА: ban [id]
    if (text && text.startsWith('ban')) {
        const targetId = text.split(' ')[1];
        if (users[targetId]) {
            users[targetId].isBanned = true;
            saveDB();
            bot.sendMessage(chatId, `🚫 Игрок ${users[targetId].n} (ID: ${targetId}) забанен и больше не сможет ловить рыбу.`);
        }
    }

    // КОМАНДА РАЗБАНА: unban [id]
    if (text && text.startsWith('unban')) {
        const targetId = text.split(' ')[1];
        if (users[targetId]) {
            users[targetId].isBanned = false;
            saveDB();
            bot.sendMessage(chatId, `✅ Игрок ${users[targetId].n} (ID: ${targetId}) разблокирован.`);
        }
    }

    // ПОСМОТРЕТЬ СТАТУ ИГРОКА: stat [id]
    if (text && text.startsWith('stat')) {
        const targetId = text.split(' ')[1];
        const u = users[targetId];
        if (u) {
            const info = `📊 СТАТИСТИКА [${u.n}]:\n💰 Баланс: ${u.b} TC\n⚡ Энергия: ${u.energy}\n🎣 Сумка: ${u.fish.toFixed(2)} кг\n🛠️ Удочка: ${u.durability}%\n🎁 Ящики: ${u.boxes}`;
            bot.sendMessage(chatId, info);
        }
    }
});

/**
 * ============================================================================
 * 🌐 API ОБРАБОТЧИК (ОСНОВНАЯ ЛОГИКА ИГРЫ)
 * ============================================================================
 */
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId, wallet, amount, referrerId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Critical: userId is missing' });
    }

    // --- РЕГИСТРАЦИЯ ИЛИ ИНИЦИАЛИЗАЦИЯ ---
    if (!users[userId]) {
        console.log(`[NEW USER] Регистрируем игрока: ${userName} (ID: ${userId})`);
        users[userId] = {
            id: userId,
            n: userName || 'Рыбак',
            b: 100,            // Стартовый баланс
            energy: 50,        // Стартовая энергия
            boxes: 1,          // Подарок за регистрацию
            fish: 0,           // Рыба в кг
            castCount: 0,      // Для системы капчи
            durability: 100,   // Прочность удочки
            totalEarned: 0,    // Весь доход (для уровней)
            lastBonus: 0,      // Время ежедневки
            dailyEnergyDrunk: 0,
            lastEnergyDate: "",
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

    /**
     * СИСТЕМА ПАССИВНОЙ РЕГЕНЕРАЦИИ ЭНЕРГИИ
     * +2 единицы каждые 10 минут
     */
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 600000) {
        const restored = Math.floor(timePassed / 600000) * 2;
        if (restored > 0) {
            u.energy = Math.min(100, (u.energy || 0) + restored);
            u.lastUpdate = now;
            console.log(`[⚡ REGEN] ${u.n} восстановил ${restored} энергии.`);
        }
    }

    // ------------------------------------------------------------------------
    // ОБРАБОТКА ДЕЙСТВИЙ (ACTION HANDLERS)
    // ------------------------------------------------------------------------

    // --- 1. ЛОВЛЯ РЫБЫ ---
    if (action === 'catch_fish') {
        // Проверка капчи мешочка
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! 🛑 Нажмите на него в следующий раз.' });
        }

        if (u.energy < 2) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️ Зайдите в мастерскую.' });

        // Траты
        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;
        u.lastUpdate = now;

        // Шанс обрыва (5%)
        if (Math.random() < 0.05) {
            u.durability -= 5;
            saveDB();
            return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! 💥 Прочность упала.' });
        }

        // Шанс пустого заброса (20%)
        if (Math.random() < 0.20) {
            saveDB();
            return res.json({ ...u, msg: 'РЫБА СОРВАЛАСЬ... 🌊' });
        }

        // Расчет веса
        let weight = (Math.random() * 2.5 + 0.2); 
        if (isGoldHour) weight *= 2; // Золотой час X2

        u.fish += weight;
        let responseMsg = `ВЫ ПОЙМАЛИ: ${weight.toFixed(2)} КГ! 🎣`;

        // Шанс на сундук (3%)
        if (Math.random() < 0.03) {
            u.boxes++;
            responseMsg += " + НАЙДЕН ЯЩИК 🎁";
        }

        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: responseMsg });
    }

    // --- 2. ПРОДАЖА УЛОВА (КУРС 0.5 TC) ---
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА! 🎒' });

        const earned = Math.floor(u.fish * 0.5); // ТВОЙ КУРС
        u.b += earned;
        u.totalEarned += earned;

        // Реферальный бонус (10%)
        if (u.referrer && users[u.referrer]) {
            const refPart = Math.floor(earned * 0.1);
            if (refPart > 0) {
                users[u.referrer].b += refPart;
                users[u.referrer].totalEarned += refPart;
                console.log(`[REF] Начислено ${refPart} TC игроку ${u.referrer}`);
            }
        }

        u.fish = 0;
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: `УЛОВ ПРОДАН ЗА ${earned} TC! 💰` });
    }

    // --- 3. РЕМОНТ ---
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ 50 TC! ❌' });
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА ВОССТАНОВЛЕНА! 🛠️' });
    }

    // --- 4. ЕЖЕДНЕВНЫЙ БОНУС ---
    if (action === 'get_daily') {
        if (now - (u.lastBonus || 0) < 86400000) {
            return res.json({ ...u, msg: 'ЖДИТЕ 24 ЧАСА! ⏳' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ВЫ ПОЛУЧИЛИ 100 TC! 🎁' });
    }

    // --- 5. МАГАЗИН (ЭНЕРГЕТИКИ И ПРОЧЕЕ) ---
    if (action === 'buy_item') {
        if (itemId === 'energy') {
            if (u.b < 500) return res.json({ ...u, msg: 'ЭНЕРГЕТИК СТОИТ 500 TC! ❌' });
            u.b -= 500;
            u.energy = Math.min(100, (u.energy || 0) + 30);
            saveDB();
            return res.json({ ...u, msg: 'ЭНЕРГИЯ ВОССТАНОВЛЕНА (+30) ⚡' });
        }
    }

    // --- 6. ОТКРЫТИЕ ЯЩИКОВ ---
    if (action === 'open_box') {
        if (!u.boxes || u.boxes <= 0) return res.json({ ...u, msg: 'У ВАС НЕТ ЯЩИКОВ! 📦' });
        u.boxes--;
        const prize = Math.floor(Math.random() * 700) + 100;
        u.b += prize;
        u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, msg: `В ЯЩИКЕ БЫЛО: ${prize} TC! ✨` });
    }

    // --- 7. ВЫВОД СРЕДСТВ ---
    if (action === 'withdraw') {
        const wAmount = parseFloat(amount);
        if (!wallet || wAmount < 30000 || u.b < wAmount) {
            return res.json({ ...u, msg: 'ОШИБКА ДАННЫХ ИЛИ МАЛО TC! ❌' });
        }
        u.b -= wAmount;
        saveDB();
        
        // Отправка уведомления админу в ЛС или консоль
        console.log(`[💳 WITHDRAW] Игрок: ${u.n} | Сумма: ${wAmount} | Кошелек: ${wallet}`);
        
        // Можно также отправить ботом в группу
        bot.sendMessage(token, `💳 НОВАЯ ЗАЯВКА НА ВЫВОД:\nИгрок: ${u.n}\nID: ${userId}\nСумма: ${wAmount} TC\nКошелек: ${wallet}`);
        
        return res.json({ ...u, msg: 'ЗАЯВКА ПРИНЯТА! ✅ Ожидайте.' });
    }

    // --- 8. ЗАГРУЗКА ДАННЫХ (DEFAULT / TOP) ---
    const top = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    res.json({
        ...u,
        level: getLevel(u.totalEarned),
        top: top
    });
});

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("=========================================================");
    console.log(`🚀 СЕРВЕР ТАМАКОИН РАБОТАЕТ НА ПОРТУ: ${PORT}`);
    console.log(`📅 СТАРТ: ${new Date().toLocaleString()}`);
    console.log("=========================================================");
});
