/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - ULTIMATE SERVER CORE v3.8.6
 * ============================================================================
 * ЦЕЛЬ: ЗАПУСК -> СМАРТ-КОНТРАКТ -> БИРЖА -> МОТОЦИКЛ 🏍️
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
// ВНИМАНИЕ: Проверь токен в BotFather, если бот не отвечает в группе.
const token = '522630:AAbiI7L3o48CEqFK0JuObIvCelcao9mzTBc'; 
const ADMIN_GROUP_ID = '-5110681605'; 

// Инициализация бота с защитой от падения при ошибке токена
let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("---------------------------------------------------------");
    console.log("📡 СИСТЕМА: Попытка запуска бота-админки...");
    console.log(`📡 ЦЕЛЕВАЯ ГРУППА: ${ADMIN_GROUP_ID}`);
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА БОТА:", error.message);
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
            console.log(`✅ БД: Загружено профилей: ${Object.keys(users).length}`);
        } catch (err) {
            console.error("❌ БД: Ошибка парсинга JSON:", err);
            users = {};
        }
    } else {
        console.log("⚠️ БД: Файл не найден. Будет создан новый при первом сохранении.");
        users = {};
    }
}

/**
 * ФУНКЦИЯ СОХРАНЕНИЯ БАЗЫ ДАННЫХ
 * Синхронная запись для предотвращения потери данных при краше
 */
const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (err) {
        console.error("❌ БД: Ошибка записи данных на диск:", err);
    }
};

// Выполняем загрузку при старте скрипта
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
        if (chatId !== ADMIN_GROUP_ID) return;

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
                    bot.sendMessage(chatId, `✅ Шеф, готово! Начислил ${amount} TC игроку ${users[targetId].n} (ID: ${targetId}).`);
                } else {
                    bot.sendMessage(chatId, `❌ Игрок с ID ${targetId} не найден в базе.`);
                }
            }
        }

        // КОМАНДА: ban [userId] - Заблокировать доступ
        if (text && text.startsWith('ban')) {
            const targetId = text.split(' ')[1];
            if (users[targetId]) {
                users[targetId].isBanned = true;
                saveDB();
                bot.sendMessage(chatId, `🚫 Игрок ${users[targetId].n} (ID: ${targetId}) забанен.`);
            }
        }

        // КОМАНДА: unban [userId] - Разблокировать доступ
        if (text && text.startsWith('unban')) {
            const targetId = text.split(' ')[1];
            if (users[targetId]) {
                users[targetId].isBanned = false;
                saveDB();
                bot.sendMessage(chatId, `✅ Игрок ${users[targetId].n} (ID: ${targetId}) разбанен.`);
            }
        }

        // КОМАНДА: /status - Проверить состояние системы
        if (text === '/status') {
            const totalUsers = Object.keys(users).length;
            bot.sendMessage(chatId, `📊 СТАТУС СЕРВЕРА: ОНЛАЙН\n👥 Игроков в базе: ${totalUsers}\n🛠️ Версия: 3.8.6`);
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

    // Критическая проверка ID
    if (!userId) {
        return res.status(400).json({ error: 'Critical: userId is required' });
    }

    // --- РЕГИСТРАЦИЯ ИЛИ ИНИЦИАЛИЗАЦИЯ ПРОФИЛЯ ---
    if (!users[userId]) {
        console.log(`[🆕 NEW] Регистрация нового рыбака: ${userName} (ID: ${userId})`);
        users[userId] = {
            id: userId,
            n: userName || 'Рыбак',
            b: 100,            // Стартовый капитал
            energy: 50,        // Стартовая энергия
            boxes: 1,          // Подарок
            fish: 0,           // Текущий улов в кг
            castCount: 0,      // Счетчик для капчи
            durability: 100,   // Прочность удочки
            totalEarned: 0,    // Весь доход за всё время
            lastBonus: 0,      // Время последнего ежедневного бонуса
            isBanned: false,   // Статус блокировки
            referrer: referrerId || null,
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Глобальная проверка блокировки
    if (u.isBanned) {
        return res.json({ msg: "ДОСТУП ОГРАНИЧЕН 🚫", isBanned: true });
    }

    const now = Date.now();
    const isGoldHour = new Date().getHours() === 19; // Счастливый час (19:00 - 20:00)

    // --- СИСТЕМА ПАССИВНОЙ РЕГЕНЕРАЦИИ ЭНЕРГИИ ---
    // Начисление +2 энергии каждые 10 минут (600 000 мс)
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 600000) {
        const units = Math.floor(timePassed / 600000) * 2;
        if (units > 0) {
            u.energy = Math.min(100, (u.energy || 0) + units);
            u.lastUpdate = now;
            console.log(`[⚡ REGEN] Игрок ${u.n} восстановил ${units} энергии.`);
        }
    }

    // ------------------------------------------------------------------------
    // ОБРАБОТКА ИГРОВЫХ ДЕЙСТВИЙ
    // ------------------------------------------------------------------------

    // 1. ЛОВЛЯ РЫБЫ
    if (action === 'catch_fish') {
        // Капча "Мешочек" каждые 5 забросов
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! 🛑' });
        }

        // Проверка ресурсов
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡ Нужно отдохнуть.' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️ Требуется ремонт.' });

        // Списание ресурсов
        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;
        u.lastUpdate = now;

        // Шанс пустого заброса (20%)
        if (Math.random() < 0.20) {
            saveDB();
            return res.json({ ...u, msg: 'НЕ КЛЮНУЛО... 🌊' });
        }

        // Расчет веса рыбы
        let weight = (Math.random() * 2.5 + 0.2); 
        if (isGoldHour) weight *= 2; // Бонус золотого часа

        u.fish += weight;
        let responseMsg = `ПОЙМАЛ: ${weight.toFixed(2)} КГ! 🎣`;

        // Шанс найти ящик (3%)
        if (Math.random() < 0.03) {
            u.boxes++;
            responseMsg += " + НАЙДЕН ЯЩИК 🎁";
        }

        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: responseMsg });
    }

    // 2. ПРОДАЖА УЛОВА (ФИКСИРОВАННЫЙ КУРС 0.5 TC ЗА 1 КГ)
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА! 🎒' });

        const earned = Math.floor(u.fish * 0.5); // ТВОЙ КУРС 0.5
        u.b += earned;
        u.totalEarned += earned;

        // Реферальные отчисления (10% пригласившему)
        if (u.referrer && users[u.referrer]) {
            const refPart = Math.floor(earned * 0.1);
            if (refPart > 0) {
                users[u.referrer].b += refPart;
                users[u.referrer].totalEarned += refPart;
            }
        }

        u.fish = 0;
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: `УЛОВ ПРОДАН ЗА ${earned} TC! 💰` });
    }

    // 3. РЕМОНТ УДОЧКИ
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ 50 TC! ❌' });
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА КАК НОВАЯ! 🛠️' });
    }

    // 4. ЕЖЕДНЕВНЫЙ БОНУС (РАЗ В 24 ЧАСА)
    if (action === 'get_daily') {
        if (now - (u.lastBonus || 0) < 86400000) {
            return res.json({ ...u, msg: 'ПРИХОДИТЕ ЗАВТРА! ⏳' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ПОЛУЧЕНО 100 TC! 🎁' });
    }

    // 5. ОТКРЫТИЕ НАЙДЕННОГО ЯЩИКА
    if (action === 'open_box') {
        if (!u.boxes || u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ! 📦' });
        u.boxes--;
        const prize = Math.floor(Math.random() * 700) + 100;
        u.b += prize;
        u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, msg: `В ЯЩИКЕ БЫЛО ${prize} TC! ✨` });
    }

    // 6. ЗАЯВКА НА ВЫВОД СРЕДСТВ
    if (action === 'withdraw') {
        const wVal = parseFloat(amount);
        if (wVal >= 30000 && u.b >= wVal) {
            u.b -= wVal;
            saveDB();
            
            // Отправка уведомления в админ-группу
            if (bot) {
                const report = `💳 ЗАЯВКА НА ВЫВОД:\n👤 Игрок: ${u.n}\n🆔 ID: ${userId}\n💰 Сумма: ${wVal} TC\n🏦 Кошелек: ${wallet}`;
                bot.sendMessage(ADMIN_GROUP_ID, report);
            }
            return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА АДМИНУ! ✅' });
        }
        return res.json({ ...u, msg: 'МИНИМУМ 30,000 TC! ❌' });
    }

    // ФОРМИРОВАНИЕ ТАБЛИЦЫ ЛИДЕРОВ (ТОП-10)
    const top = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    // Возврат текущего состояния игрока и топа
    res.json({
        ...u,
        level: getLevel(u.totalEarned),
        top: top
    });
});

// --- ЗАПУСК СЕРВЕРА С ПРИВЯЗКОЙ К ПОРТУ RENDER ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log("=========================================================");
    console.log(`🚀 СЕРВЕР ТАМАКОИН ЗАПУЩЕН!`);
    console.log(`📡 ПОРТ: ${PORT} | ХОСТ: 0.0.0.0`);
    console.log(`📅 ВРЕМЯ: ${new Date().toLocaleString()}`);
    console.log("=========================================================");
    
    // Бот активируется после успешного открытия порта
    if (bot) {
        console.log("🤖 Админ-бот готов к приему команд в группе.");
    }
});
