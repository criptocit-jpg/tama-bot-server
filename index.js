/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - ULTIMATE SERVER CORE v3.8.8
 * ============================================================================
 * ПЛАН: ЗАПУСК -> СМАРТ-КОНТРАКТ -> БИРЖА -> МОТОЦИКЛ 🏍️
 * ----------------------------------------------------------------------------
 * ВНИМАНИЕ: ДАННЫЙ КОД ЯВЛЯЕТСЯ "ЗОЛОТЫМ ФУНДАМЕНТОМ". 
 * СТРОГОЕ ТАБУ НА СОКРАЩЕНИЕ. ВСЕ КОММЕНТАРИИ И ПРОВЕРКИ СОХРАНЕНЫ.
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- КОНФИГУРАЦИЯ СИСТЕМЫ ---
// Полный рабочий токен из твоих прошлых версий
const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 

// Инициализация бота с защитой от падения
let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("---------------------------------------------------------");
    console.log("📡 СИСТЕМА: Попытка запуска бота-админки...");
    console.log(`📡 ЦЕЛЕВАЯ ГРУППА: ${ADMIN_GROUP_ID}`);
    console.log("---------------------------------------------------------");
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ БОТА:", error.message);
}

const app = express();

// Настройки Middlewares для корректной работы API и CORS
app.use(cors());
app.use(express.json());

// --- БАЗА ДАННЫХ (ФАЙЛОВАЯ СИСТЕМА JSON) ---
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

/**
 * ФУНКЦИЯ ЗАГРУЗКИ БАЗЫ ДАННЫХ
 * Читает файл database.json при старте сервера на Render
 */
function loadDatabase() {
    console.log("📂 БД: Инициализация загрузки данных...");
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log(`✅ БД: Успешно загружено профилей: ${Object.keys(users).length}`);
        } catch (err) {
            console.error("❌ БД: Ошибка при чтении или парсинге JSON:", err);
            users = {};
        }
    } else {
        console.log("⚠️ БД: Файл не найден. Будет создан новый при первом сохранении.");
        users = {};
    }
}

/**
 * ФУНКЦИЯ СОХРАНЕНИЯ БАЗЫ ДАННЫХ
 * Синхронная запись для предотвращения потери данных
 */
const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (err) {
        console.error("❌ БД: Ошибка записи данных на диск:", err);
    }
};

// Выполняем первичную загрузку при старте
loadDatabase();

/**
 * СИСТЕМА РАНГОВ И УРОВНЕЙ ИГРОКА
 * Рассчитывается динамически на основе общего заработка (totalEarned)
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
 * 🤖 МОДУЛЬ АДМИНИСТРИРОВАНИЯ (TELEGRAM BOT API)
 * Слушает команды только в указанной админ-группе
 * ============================================================================
 */
if (bot) {
    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        const text = msg.text;
        const sender = msg.from.username || msg.from.first_name;

        // Фильтр: обрабатываем сообщения ТОЛЬКО из нашей группы
        if (chatId !== ADMIN_GROUP_ID) {
            return;
        }

        console.log(`[📩 COMMAND] Сообщение от ${sender}: ${text}`);

        // КОМАНДА: give [userId] [amount] - Начислить TC
        if (text && text.startsWith('give')) {
            const parts = text.split(' ');
            if (parts.length === 3) {
                const targetId = parts[1];
                const amount = parseFloat(parts[2]);

                if (users[targetId]) {
                    users[targetId].b += amount;
                    users[targetId].totalEarned += amount;
                    saveDB();
                    bot.sendMessage(chatId, `✅ Начислено ${amount} TC игроку ${users[targetId].n} (ID: ${targetId}).`);
                    console.log(`[💰 ADMIN] ${sender} выдал ${amount} TC игроку ${targetId}`);
                } else {
                    bot.sendMessage(chatId, `❌ Ошибка: Игрок с ID ${targetId} не найден.`);
                }
            }
        }

        // КОМАНДА: ban [userId] - Заблокировать доступ
        if (text && text.startsWith('ban')) {
            const targetId = text.split(' ')[1];
            if (users[targetId]) {
                users[targetId].isBanned = true;
                saveDB();
                bot.sendMessage(chatId, `🚫 Игрок ${users[targetId].n} заблокирован.`);
            }
        }

        // КОМАНДА: /status - Проверить состояние системы
        if (text === '/status') {
            const totalUsers = Object.keys(users).length;
            bot.sendMessage(chatId, `📊 СТАТУС СЕРВЕРА: ОНЛАЙН\n👥 Игроков в базе: ${totalUsers}\n🛠️ Версия: 3.8.8`);
        }
    });
}

/**
 * ============================================================================
 * 🌐 API ROUTES (ОСНОВНОЙ ФУНКЦИОНАЛ ИГРЫ)
 * Обработка всех действий игрока из Mini App
 * ============================================================================
 */
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId, wallet, amount, referrerId } = req.body;

    // Критическая проверка наличия userId
    if (!userId) {
        return res.status(400).json({ error: 'Critical: userId missing' });
    }

    // --- ИНИЦИАЛИЗАЦИЯ ИЛИ ЗАГРУЗКА ПРОФИЛЯ ---
    if (!users[userId]) {
        console.log(`[🆕 NEW] Регистрация: ${userName} (ID: ${userId})`);
        users[userId] = {
            id: userId,
            n: userName || 'Рыбак',
            b: 100,            // Начальный баланс
            energy: 50,        // Энергия
            boxes: 1,          // Подарочный ящик
            fish: 0,           // Улов в кг
            castCount: 0,      // Счетчик забросов для капчи
            durability: 100,   // Состояние удочки
            totalEarned: 0,    // Общий заработок
            lastBonus: 0,      // Время последнего бонуса
            isBanned: false,   // Статус бана
            referrer: referrerId || null,
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Проверка на блокировку
    if (u.isBanned) {
        return res.json({ msg: "ВАШ АККАУНТ ЗАБЛОКИРОВАН 🚫", isBanned: true });
    }

    const now = Date.now();
    const isGoldHour = new Date().getHours() === 19; // Бонусный час в 19:00

    // --- СИСТЕМА РЕГЕНЕРАЦИИ ЭНЕРГИИ ---
    // Каждые 10 минут восстанавливаем по 2 единицы
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 600000) {
        const energyGain = Math.floor(timePassed / 600000) * 2;
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
        // Проверка на капчу (каждый 5-й заброс)
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК УПУЩЕН! 🛑' });
        }

        if (u.energy < 2) {
            return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
        }
        if (u.durability <= 0) {
            return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });
        }

        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        // Шанс того, что рыба сорвется (20%)
        if (Math.random() < 0.20) {
            saveDB();
            return res.json({ ...u, msg: 'РЫБА УПЛЫЛА... 🌊' });
        }

        // Логика расчета веса рыбы
        let weight = (Math.random() * 2.5 + 0.2);
        if (isGoldHour) weight *= 2; // Двойной улов в золотой час

        u.fish += weight;
        let responseMsg = `УЛОВ: ${weight.toFixed(2)} КГ! 🎣`;

        // Шанс найти ящик (3%)
        if (Math.random() < 0.03) {
            u.boxes++;
            responseMsg += " + НАЙДЕН ЯЩИК! 🎁";
        }

        saveDB();
        return res.json({ 
            ...u, 
            level: getLevel(u.totalEarned), 
            msg: responseMsg 
        });
    }

    // 2. ПРОДАЖА РЫБЫ (КУРС 0.5 TC ЗА 1 КГ)
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) {
            return res.json({ ...u, msg: 'СУМКА ПУСТА! 🎒' });
        }

        const profit = Math.floor(u.fish * 0.5);
        u.b += profit;
        u.totalEarned += profit;

        // Реферальная система (начисление 10% пригласившему)
        if (u.referrer && users[u.referrer]) {
            const refBonus = Math.floor(profit * 0.1);
            if (refBonus > 0) {
                users[u.referrer].b += refBonus;
                users[u.referrer].totalEarned += refBonus;
            }
        }

        u.fish = 0;
        saveDB();
        return res.json({ 
            ...u, 
            level: getLevel(u.totalEarned), 
            msg: `ПРОДАНО ЗА ${profit} TC! 💰` 
        });
    }

    // 3. РЕМОНТ ИНСТРУМЕНТА (СТОИМОСТЬ 50 TC)
    if (action === 'repair') {
        if (u.b < 50) {
            return res.json({ ...u, msg: 'НУЖНО 50 TC ДЛЯ РЕМОНТА! ❌' });
        }
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА ПОЛНОСТЬЮ ПОЧИНЕНА! 🛠️' });
    }

    // 4. ЕЖЕДНЕВНЫЙ БОНУС
    if (action === 'get_daily') {
        if (now - (u.lastBonus || 0) < 86400000) {
            return res.json({ ...u, msg: 'БОНУС БУДЕТ ДОСТУПЕН ЗАВТРА! ⏳' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ВЫ ПОЛУЧИЛИ 100 TC! 🎁' });
    }

    // 5. ОТКРЫТИЕ ЯЩИКА
    if (action === 'open_box') {
        if (!u.boxes || u.boxes <= 0) {
            return res.json({ ...u, msg: 'У ВАС НЕТ ЯЩИКОВ! 📦' });
        }
        u.boxes--;
        const win = Math.floor(Math.random() * 700) + 100;
        u.b += win;
        u.totalEarned += win;
        saveDB();
        return res.json({ ...u, msg: `ВЫИГРЫШ ИЗ ЯЩИКА: ${win} TC! ✨` });
    }

    // 6. ЗАЯВКА НА ВЫВОД СРЕДСТВ (ОТ 30,000 TC)
    if (action === 'withdraw') {
        const withdrawAmount = parseFloat(amount);
        if (withdrawAmount >= 30000 && u.b >= withdrawAmount) {
            u.b -= withdrawAmount;
            saveDB();
            
            // Отправка данных админу в Телеграм
            if (bot) {
                const adminMsg = `💳 НОВАЯ ЗАЯВКА НА ВЫВОД:\n👤 Игрок: ${u.n}\n🆔 ID: ${userId}\n💰 Сумма: ${withdrawAmount} TC\n🏦 Кошелек: ${wallet}`;
                bot.sendMessage(ADMIN_GROUP_ID, adminMsg);
            }
            return res.json({ ...u, msg: 'ЗАЯВКА НА ВЫВОД ОТПРАВЛЕНА! ✅' });
        }
        return res.json({ ...u, msg: 'ОШИБКА: МИНИМУМ 30,000 TC! ❌' });
    }

    // ФОРМИРОВАНИЕ ТАБЛИЦЫ ЛИДЕРОВ (ТОП-10)
    const leaderboard = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(p => ({ n: p.n, b: p.b }));

    // Отправка данных игрока и топа по умолчанию
    res.json({
        ...u,
        level: getLevel(u.totalEarned),
        top: leaderboard
    });
});

// --- СТАРТ СЕРВЕРА С ПРИВЯЗКОЙ К ХОСТУ RENDER ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log("=========================================================");
    console.log(`🚀 СЕРВЕР ТАМАКОИН УСПЕШНО ЗАПУЩЕН!`);
    console.log(`📡 ПОРТ: ${PORT} | ХОСТ: 0.0.0.0`);
    console.log(`📅 ВРЕМЯ: ${new Date().toLocaleString()}`);
    console.log("=========================================================");
    
    // Бот активируется только после подтверждения порта
    if (bot) {
        console.log("🤖 Админ-бот подключен и слушает группу.");
    }
});
