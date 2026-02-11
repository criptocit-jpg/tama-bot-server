/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - ULTIMATE SERVER CORE v3.9.1
 * ============================================================================
 
 * ----------------------------------------------------------------------------
 * ОБНОВЛЕНИЕ: Кнопки подтверждения выплат + Расширенное логирование.
 * ТОКЕН: 8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg
 * ГРУППА: -5110681605
 * СТАТУС: ЗОЛОТАЯ БАЗА (СТРОГОЕ СОБЛЮДЕНИЕ ОБЪЕМА 368 СТРОК)
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

/**
 * --- ГЛОБАЛЬНЫЕ НАСТРОЙКИ ---
 * Здесь хранятся ключи доступа к API Telegram и настройки сервера
 */
const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 

// Инициализация Telegram-бота для администрирования
let bot;
try {
    bot = new TelegramBot(token, { 
        polling: {
            interval: 300,
            autoStart: true,
            params: { timeout: 10 }
        } 
    });
    console.log("---------------------------------------------------------");
    console.log("📡 СИСТЕМА: Инициализация бота-админки прошла успешно.");
    console.log(`📡 КАНАЛ СВЯЗИ: Группа ${ADMIN_GROUP_ID}`);
    console.log("---------------------------------------------------------");
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА: Бот не смог запуститься!");
    console.error("ТЕКСТ ОШИБКИ:", error.message);
}

const app = express();

/**
 * --- НАСТРОЙКИ СЕРВЕРА (MIDDLEWARE) ---
 * Позволяют принимать запросы с разных доменов и парсить JSON
 */
app.use(cors());
app.use(express.json());

// Путь к файлу базы данных в корневой папке проекта
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

/**
 * ФУНКЦИЯ: ЗАГРУЗКА БАЗЫ ДАННЫХ
 * Выполняется один раз при старте сервера
 */
function loadDatabase() {
    console.log("📂 БД: Начинаю чтение файла данных...");
    if (fs.existsSync(DB_FILE)) {
        try {
            const rawData = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(rawData);
            console.log(`✅ БД: Данные успешно загружены. Профилей в памяти: ${Object.keys(users).length}`);
        } catch (err) {
            console.error("❌ БД: Ошибка при обработке JSON-файла!");
            console.error(err);
            users = {};
        }
    } else {
        console.log("⚠️ БД: Файл database.json не обнаружен. Система создаст новый.");
        users = {};
    }
}

/**
 * ФУНКЦИЯ: СОХРАНЕНИЕ БАЗЫ ДАННЫХ
 * Записывает текущее состояние пользователей на диск
 */
const saveDB = () => {
    try {
        const jsonString = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, jsonString);
        console.log(`💾 БД: Изменения сохранены на диск (${new Date().toLocaleTimeString()})`);
    } catch (err) {
        console.error("❌ БД: Ошибка при записи файла на диск!");
        console.error(err);
    }
};

// Вызываем загрузку данных сразу после определения функций
loadDatabase();

/**
 * ФУНКЦИЯ: ОПРЕДЕЛЕНИЕ РАНГА
 * Динамический расчет звания игрока на основе заработанных TC
 */
const getLevel = (totalEarned) => {
    const score = totalEarned || 0;
    if (score >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (score >= 500000)  return "ПОСЕЙДОН 🌊";
    if (score >= 250000)  return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (score >= 150000)  return "МОРСКОЙ ВОЛК 🐺";
    if (score >= 50000)   return "КАПИТАН 👨‍✈️";
    if (score >= 15000)   return "РЫБОЛОВ-ПРО 🎣";
    if (score >= 5000)    return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

/**
 * ============================================================================
 * 🤖 МОДУЛЬ TELEGRAM (ОБРАБОТКА КНОПОК И КОМАНД)
 * ============================================================================
 */
if (bot) {
    /**
     * СЛУШАТЕЛЬ КНОПОК (CALLBACK QUERIES)
     * Обрабатывает нажатие на кнопку "Оплачено" в админ-чате
     */
    bot.on('callback_query', (query) => {
        const callbackData = query.data; 
        
        if (callbackData.startsWith('pay_')) {
            const [action, targetId, amount] = callbackData.split('_');
            
            console.log(`[💳 PAYMENT] Шеф подтвердил выплату для ID: ${targetId} на сумму ${amount}`);

            // 1. Изменяем сообщение в группе (убираем кнопку, пишем статус)
            bot.editMessageText(`✅ **ВЫПЛАТА ЗАВЕРШЕНА**\n\n💰 Сумма: **${amount} TC**\n👤 Игрок ID: \`${targetId}\`\n\nСтатус: Подтверждено Шефом лично. Баланс игрока списан. 🏍️`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            });

            // 2. Отправляем уведомление счастливчику в личные сообщения
            const notifyText = `🌟 **ВАШИ МОНЕТЫ ПРИШЛИ!** 🌟\n\nАдминистрация подтвердила выплату **${amount} TC**.\nСредства отправлены на ваш TON-кошелек.\n\nСпасибо за игру! Ждем вас на новой рыбалке! 🎣💨`;
            
            bot.sendMessage(targetId, notifyText).catch((err) => {
                console.log(`⚠️ Не удалось уведомить игрока ${targetId}. Бот заблокирован или не запущен пользователем.`);
            });
            
            // Всплывающее уведомление для админа в Telegram
            bot.answerCallbackQuery(query.id, { text: "Игрок успешно уведомлен!", show_alert: false });
        }
    });

    /**
     * СЛУШАТЕЛЬ ТЕКСТОВЫХ КОМАНД
     * Работает только внутри указанной админ-группы
     */
    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        const incomingText = msg.text;
        const senderName = msg.from.first_name;

        // Игнорируем сообщения не из нашей группы
        if (chatId !== ADMIN_GROUP_ID) return;

        // КОМАНДА: give [ID] [Amount]
        if (incomingText && incomingText.startsWith('give')) {
            const params = incomingText.split(' ');
            if (params.length === 3) {
                const targetUid = params[1];
                const count = parseFloat(params[2]);

                if (users[targetUid]) {
                    users[targetUid].b += count;
                    users[targetUid].totalEarned += count;
                    saveDB();
                    bot.sendMessage(chatId, `💰 **ОПЕРАЦИЯ УСПЕШНА**\nИгроку **${users[targetUid].n}** зачислено **${count} TC**.`);
                } else {
                    bot.sendMessage(chatId, `❌ **ОШИБКА**: Пользователь с ID \`${targetUid}\` не найден в нашей базе.`);
                }
            }
        }

        // КОМАНДА: /status
        if (incomingText === '/status') {
            const playersCount = Object.keys(users).length;
            const statusMsg = `📊 **ОТЧЕТ СЕРВЕРА**\n\n✅ Статус: **ONLINE**\n👥 Всего рыбаков: **${playersCount}**\n🛠️ Версия ядра: **3.9.1**\n🏍️ Цель: **Ближе с каждым днем!**`;
            bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });
        }
    });
}

/**
 * ============================================================================
 * 🌐 API ROUTES (ГЕЙМПЛЕЙ И ВЗАИМОДЕЙСТВИЕ С MINI APP)
 * ============================================================================
 */
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, referrerId } = req.body;

    // Базовая проверка безопасности
    if (!userId) {
        return res.status(400).json({ error: 'System error: Missing UserID' });
    }

    // --- РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ ---
    if (!users[userId]) {
        console.log(`[🆕 NEW USER] Добро пожаловать, ${userName} (ID: ${userId})`);
        users[userId] = {
            id: userId,
            n: userName || 'Рыбак',
            b: 100,            // Начальный бонус
            energy: 50,        // Стартовая энергия
            boxes: 1,          // Подарок за регистрацию
            fish: 0,           // Текущий вес рыбы
            castCount: 0,      // Для системы капчи
            durability: 100,   // Прочность снастей
            totalEarned: 0,    // Статистика для рангов
            lastBonus: 0,      // Таймер ежедневки
            isBanned: false,   // Черный список
            referrer: referrerId || null,
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Проверка на бан
    if (u.isBanned) {
        return res.json({ msg: "ДОСТУП ЗАБЛОКИРОВАН 🚫", isBanned: true });
    }

    const currentTime = Date.now();

    /**
     * ЛОГИКА ПАССИВНОЙ РЕГЕНЕРАЦИИ
     * Восстанавливаем 2 единицы энергии каждые 10 минут
     */
    const secondsPassed = currentTime - (u.lastUpdate || currentTime);
    if (secondsPassed > 600000) {
        const energyPoints = Math.floor(secondsPassed / 600000) * 2;
        if (energyPoints > 0) {
            u.energy = Math.min(100, (u.energy || 0) + energyPoints);
            u.lastUpdate = currentTime;
        }
    }

    // --- ОБРАБОТКА ИГРОВЫХ СОБЫТИЙ ---

    // ДЕЙСТВИЕ: ЛОВЛЯ РЫБЫ
    if (action === 'catch_fish') {
        // Проверка капчи "Мешочек"
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК СОРВАЛСЯ! 🛑' });
        }

        // Проверка ресурсов игрока
        if (u.energy < 2) return res.json({ ...u, msg: 'МАЛО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        // Расход ресурсов
        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        // Вероятность улова (80%)
        if (Math.random() < 0.20) {
            saveDB();
            return res.json({ ...u, msg: 'ЭХ, ПУСТОЙ ЗАБРОС... 🌊' });
        }

        // Расчет веса рыбы (от 0.2 до 2.7 кг)
        let fishWeight = (Math.random() * 2.5 + 0.2);
        u.fish += fishWeight;

        // Шанс найти секретный ящик (3%)
        let bonusInfo = "";
        if (Math.random() < 0.03) {
            u.boxes++;
            bonusInfo = " + НАЙДЕН ЯЩИК 🎁";
        }

        saveDB();
        return res.json({ 
            ...u, 
            level: getLevel(u.totalEarned), 
            msg: `ПОЙМАЛ: ${fishWeight.toFixed(2)} КГ! 🎣${bonusInfo}` 
        });
    }

    // ДЕЙСТВИЕ: ПРОДАЖА УЛОВА
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) {
            return res.json({ ...u, msg: 'В СУМКЕ НИЧЕГО НЕТ! 🎒' });
        }

        // Курс обмена: 1 кг = 0.5 TC
        const goldEarned = Math.floor(u.fish * 0.5);
        u.b += goldEarned;
        u.totalEarned += goldEarned;

        // Реферальный бонус (10% пригласившему)
        if (u.referrer && users[u.referrer]) {
            const bonus = Math.floor(goldEarned * 0.1);
            if (bonus > 0) {
                users[u.referrer].b += bonus;
                users[u.referrer].totalEarned += bonus;
            }
        }

        u.fish = 0;
        saveDB();
        return res.json({ 
            ...u, 
            level: getLevel(u.totalEarned), 
            msg: `УЛОВ ПРОДАН ЗА ${goldEarned} TC! 💰` 
        });
    }

    // ДЕЙСТВИЕ: ЗАЯВКА НА ВЫВОД (С ИНЛАЙН-КНОПКОЙ)
    if (action === 'withdraw') {
        const reqAmount = parseFloat(amount);
        
        if (reqAmount >= 30000 && u.b >= reqAmount) {
            u.b -= reqAmount;
            saveDB();
            
            // Отправляем уведомление в админ-группу с кнопкой подтверждения
            if (bot) {
                const report = `💳 **НОВАЯ ЗАЯВКА НА ВЫПЛАТУ**\n\n👤 Рыбак: **${u.n}**\n🆔 ID: \`${userId}\`\n💰 Сумма: **${reqAmount} TC**\n🏦 Кошелек: \`${wallet}\`\n\nИнструкция: Нажми кнопку после перевода в кошельке.`;
                
                bot.sendMessage(ADMIN_GROUP_ID, report, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ ПОДТВЕРДИТЬ ОПЛАТУ", callback_data: `pay_${userId}_${reqAmount}` }
                            ]
                        ]
                    }
                });
            }
            return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА ШЕФУ! ✅' });
        }
        return res.json({ ...u, msg: 'МИНИМУМ 30,000 TC! ❌' });
    }

    // ФОРМИРОВАНИЕ ТАБЛИЦЫ ЛИДЕРОВ (TOP-10)
    const topPerformers = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    // Финальный ответ сервера с актуальными данными
    res.json({
        ...u,
        level: getLevel(u.totalEarned),
        top: topPerformers
    });
});

/**
 * --- ИНИЦИАЛИЗАЦИЯ СЕРВЕРА (START UP) ---
 * Привязка к порту и запуск прослушивания входящего трафика
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log("=========================================================");
    console.log(`🚀 СЕРВЕР ТАМАКОИН v3.9.1 УСПЕШНО ЗАПУЩЕН!`);
    console.log(`📡 ПОРТ: ${PORT} | ХОСТ: 0.0.0.0 (Для Render)`);
    console.log(`📅 СТАРТ: ${new Date().toLocaleString()}`);
    console.log("=========================================================");
    
    if (bot) {
        console.log("🤖 Админ-бот в режиме ожидания команд в группе.");
    }
});

// КОНЕЦ ФАЙЛА - ЗОЛОТАЯ БАЗА СОХРАНЕНА
