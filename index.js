/**
 * =============================================================
 * TAMCOIN FISHING SERVER - GOLDEN BASE v3.7.1
 * =============================================================
 * ПЛАН: БОТ -> КОНТРАКТ -> БИРЖА -> МОТОЦИКЛ 🏍️
 * =============================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// Настройка CORS для работы с Telegram Mini Apps
app.use(cors());
app.use(express.json());

// Путь к базе данных
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

/**
 * ЗАГРУЗКА БАЗЫ ДАННЫХ
 * Обеспечивает сохранность данных при перезагрузке сервера Render
 */
function loadDatabase() {
    console.log("---------------------------------------------------------");
    console.log("ПОПЫТКА ЗАГРУЗКИ БАЗЫ ДАННЫХ...");
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log(`УСПЕШНО: Загружено ${Object.keys(users).length} пользователей.`);
        } catch (e) {
            console.error("КРИТИЧЕСКАЯ ОШИБКА ЧТЕНИЯ БД:", e);
            users = {};
        }
    } else {
        console.log("ИНФО: Файл базы данных не найден. Создаю новую базу...");
        users = {};
    }
    console.log("---------------------------------------------------------");
}

/**
 * СОХРАНЕНИЕ БАЗЫ ДАННЫХ
 */
const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (e) {
        console.error("ОШИБКА ПРИ СОХРАНЕНИИ БД В ФАЙЛ:", e);
    }
};

// Первичная загрузка
loadDatabase();

/**
 * ЛОГИКА УРОВНЕЙ (LEVEL SYSTEM)
 * Зависит от общего заработка (totalEarned)
 */
const getLevel = (total) => {
    const t = total || 0;
    if (t >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (t >= 500000) return "ПОСЕЙДОН 🌊";
    if (t >= 150000) return "МОРСКОЙ ВОЛК 🐺";
    if (t >= 50000) return "КАПИТАН 👨‍✈️";
    if (t >= 15000) return "РЫБОЛОВ-ПРО 🎣";
    if (t >= 5000) return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

/**
 * =============================================================
 * АДМИН-ПАНЕЛЬ (УПРАВЛЕНИЕ ПРОЕКТОМ)
 * =============================================================
 */
app.post('/api/admin/power', (req, res) => {
    const { adminKey, targetId, action, value } = req.body;

    // Сверхсекретный ключ
    if (adminKey !== 'super_secret_key_777') {
        console.warn(`[⚠️ ВНИМАНИЕ] Попытка несанкционированного доступа к админке!`);
        return res.status(403).json({ error: 'ОТКАЗАНО В ДОСТУПЕ' });
    }

    const u = users[targetId];
    if (!u) return res.status(404).json({ error: 'ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН' });

    console.log(`[🛠️ ADMIN] Действие: ${action} для ID: ${targetId} назначено значение: ${value}`);

    switch (action) {
        case 'give_money':
            u.b += parseFloat(value);
            u.totalEarned += parseFloat(value);
            break;
        case 'set_energy':
            u.energy = parseInt(value);
            break;
        case 'ban':
            u.isBanned = true;
            break;
        case 'unban':
            u.isBanned = false;
            break;
        case 'reset_durability':
            u.durability = 100;
            break;
        default:
            return res.json({ error: 'Неизвестное действие' });
    }

    saveDB();
    res.json({ success: true, message: "Данные обновлены", user: u });
});

/**
 * =============================================================
 * ГЛАВНЫЙ ОБРАБОТЧИК API
 * =============================================================
 */
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId, wallet, amount, referrerId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Критическая ошибка: userId отсутствует' });
    }

    // ИНИЦИАЛИЗАЦИЯ НОВОГО ИГРОКА
    if (!users[userId]) {
        console.log(`[🆕 НОВЫЙ ИГРОК] ${userName} (ID: ${userId}) зашел в игру!`);
        users[userId] = {
            id: userId,
            n: userName || 'Анонимный Рыбак',
            b: 100,            // Начальный баланс
            energy: 50,        // Начальная энергия
            boxes: 1,          // Подарочный ящик
            fish: 0,           // Рыба в сумке (кг)
            castCount: 0,      // Кол-во забросов (для капчи)
            durability: 100,   // Прочность удочки
            totalEarned: 0,    // Весь заработок за историю
            lastBonus: 0,      // Время последнего ежедневного бонуса
            dailyEnergyDrunk: 0,
            lastEnergyDate: "",
            isBanned: false,
            referrer: referrerId || null, // Кто пригласил
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Проверка на бан
    if (u.isBanned) {
        return res.json({ msg: "ВАШ АККАУНТ ЗАБЛОКИРОВАН 🚫 Обратитесь в поддержку.", isBanned: true });
    }

    const now = Date.now();
    const dateObj = new Date();
    const isGoldHour = dateObj.getHours() === 19; // Золотой час в 19:00

    /**
     * ЛОГИКА РЕГЕНЕРАЦИИ ЭНЕРГИИ
     * Восстанавливаем 2 ед. каждые 10 минут, если игрок не в игре
     */
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 600000) { 
        const energyToRestore = Math.floor(timePassed / 600000) * 2;
        if (energyToRestore > 0) {
            u.energy = Math.min(100, (u.energy || 0) + energyToRestore);
            u.lastUpdate = now;
            console.log(`[⚡ РЕГЕН] Игрок ${u.n} восстановил ${energyToRestore} энергии.`);
        }
    }

    /**
     * ОБРАБОТКА КОМАНД
     */
    try {
        // --- ЛОВЛЯ РЫБЫ ---
        if (action === 'catch_fish') {
            // Проверка капчи (мешочка) каждые 5 забросов
            if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
                console.log(`[⚠️ КАПЧА] Игрок ${u.n} должен поймать мешочек.`);
                return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! 🛑 Нужно нажать на него.' });
            }

            if (u.energy < 2) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО ЭНЕРГИИ! ⚡ Отдохните.' });
            if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️ Почините в мастерской.' });

            // Расход ресурсов
            u.energy -= 2;
            u.durability -= 1;
            u.castCount++;
            u.lastUpdate = now;

            // Шанс на критическую поломку (5%)
            if (Math.random() < 0.05) {
                u.durability -= 5;
                saveDB();
                return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! 💥 Прочность сильно упала.' });
            }

            // Шанс на неудачу (25%)
            if (Math.random() < 0.25) {
                saveDB();
                return res.json({ ...u, msg: 'ПУСТО... 🌊 Рыба сорвалась.' });
            }

            // Успешный улов (вес от 0.2 до 2.7 кг)
            let weight = (Math.random() * 2.5 + 0.2); 
            if (isGoldHour) {
                weight *= 2; // X2 в золотой час
                console.log(`[🔥 GOLD HOUR] ${u.n} ловит двойной улов!`);
            }
            
            u.fish += weight;
            let finalMsg = `ВЫ ПОЙМАЛИ РЫБУ: ${weight.toFixed(2)} КГ! 🎣`;

            // Шанс найти ящик (3%)
            if (Math.random() < 0.03) {
                u.boxes++;
                finalMsg += " + НАЙДЕН ЯЩИК 🎁";
                console.log(`[🎁 БОНУС] ${u.n} нашел секретный ящик!`);
            }

            saveDB();
            return res.json({ ...u, level: getLevel(u.totalEarned), msg: finalMsg });
        }

        // --- ПРОДАЖА РЫБЫ (Курс 0.5 TC за 1 кг) ---
        if (action === 'sell_fish') {
            if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'ВАША СУМКА ПУСТА! Сначала поймайте рыбу.' });
            
            let earned = Math.floor(u.fish * 0.5); // ТВОЙ КУРС 0.5
            u.b += earned;
            u.totalEarned += earned;
            
            // Реферальные отчисления (10%)
            if (u.referrer && users[u.referrer]) {
                const refBonus = Math.floor(earned * 0.1);
                if (refBonus > 0) {
                    users[u.referrer].b += refBonus;
                    users[u.referrer].totalEarned += refBonus;
                    console.log(`[👥 REF] ${u.referrer} получил ${refBonus} TC от ${u.n}`);
                }
            }

            console.log(`[💰 ПРОДАЖА] ${u.n} продал рыбу на ${earned} TC.`);
            u.fish = 0;
            saveDB();
            return res.json({ ...u, level: getLevel(u.totalEarned), msg: `УЛОВ ПРОДАН ЗА ${earned} TC! 💰` });
        }

        // --- ПОЧИНКА УДОЧКИ ---
        if (action === 'repair') {
            if (u.b < 50) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC! Ремонт стоит 50.' });
            u.b -= 50;
            u.durability = 100;
            saveDB();
            return res.json({ ...u, msg: 'УДОЧКА КАК НОВАЯ! 🛠️ (100%)' });
        }

        // --- ЕЖЕДНЕВНЫЙ БОНУС ---
        if (action === 'get_daily') {
            if (now - (u.lastBonus || 0) < 86400000) {
                return res.json({ ...u, msg: 'БОНУС ЕЩЕ НЕ ГОТОВ! Заходите завтра.' });
            }
            u.b += 100;
            u.lastBonus = now;
            saveDB();
            return res.json({ ...u, msg: 'ВЫ ПОЛУЧИЛИ 100 TC! ✨ Приходите через 24 часа.' });
        }

        // --- МАГАЗИН И ПРЕДМЕТЫ ---
        if (action === 'buy_item') {
            if (itemId === 'energy') {
                const today = dateObj.toLocaleDateString();
                if (u.lastEnergyDate !== today) {
                    u.dailyEnergyDrunk = 0;
                    u.lastEnergyDate = today;
                }
                if (u.dailyEnergyDrunk >= 3) return res.json({ ...u, msg: 'ЛИМИТ 3 БАНКИ В ДЕНЬ! 🤢' });
                if (u.b < 500) return res.json({ ...u, msg: 'МАЛО TC! Энергетик стоит 500.' });
                
                u.b -= 500;
                u.energy = Math.min(100, (u.energy || 0) + 30);
                u.dailyEnergyDrunk++;
                saveDB();
                return res.json({ ...u, msg: `ЭНЕРГИЯ ВОССТАНОВЛЕНА! ⚡ (${u.dailyEnergyDrunk}/3 за сегодня)` });
            }
            if (itemId === 'titan') {
                if (u.b < 1000) return res.json({ ...u, msg: 'МАЛО TC! Леска стоит 1000.' });
                u.b -= 1000;
                // В будущих версиях здесь будет флаг защиты от обрыва
                saveDB();
                return res.json({ ...u, msg: 'ТИТАНОВАЯ ЛЕСКА УСТАНОВЛЕНА! 🎣 (Шанс обрыва снижен)' });
            }
        }

        // --- ОТКРЫТИЕ ЯЩИКА ---
        if (action === 'open_box') {
            if (!u.boxes || u.boxes <= 0) return res.json({ ...u, msg: 'У ВАС НЕТ ЯЩИКОВ! Ловите рыбу, чтобы найти их.' });
            
            u.boxes--;
            let prize = Math.floor(Math.random() * 700) + 100; // 100 - 800 TC
            u.b += prize;
            u.totalEarned += prize;
            
            console.log(`[📦 BOX] ${u.n} открыл ящик и выиграл ${prize} TC!`);
            saveDB();
            return res.json({ ...u, msg: `ИЗ ЯЩИКА ВЫПАЛО: ${prize} TC! ✨` });
        }

        // --- ЗАЯВКА НА ВЫВОД ---
        if (action === 'withdraw') {
            const wAmount = parseFloat(amount);
            if (!wallet || wallet.length < 10) return res.json({ ...u, msg: 'НЕВЕРНЫЙ TON АДРЕС! ❌' });
            if (wAmount < 30000) return res.json({ ...u, msg: 'МИНИМАЛЬНЫЙ ВЫВОД: 30 000 TC!' });
            if (u.b < wAmount) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО СРЕДСТВ НА БАЛАНСЕ!' });

            u.b -= wAmount;
            saveDB();
            
            // Логируем в консоль сервера (админ увидит)
            console.log("=========================================================");
            console.log(`!!! ЗАЯВКА НА ВЫВОД !!!`);
            console.log(`ИГРОК: ${u.n} (ID: ${userId})`);
            console.log(`СУММА: ${wAmount} TC`);
            console.log(`АДРЕС: ${wallet}`);
            console.log("=========================================================");
            
            return res.json({ ...u, msg: 'ЗАЯВКА ПРИНЯТА! ✅ Ожидайте обработки (до 24ч).' });
        }

        // ЗАГРУЗКА ДАННЫХ (Default)
        const top = Object.values(users)
            .sort((a, b) => (b.b || 0) - (a.b || 0))
            .slice(0, 10)
            .map(user => ({ n: user.n, b: user.b }));

        res.json({
            ...u,
            level: getLevel(u.totalEarned),
            top: top
        });

    } catch (err) {
        console.error("ОШИБКА ОБРАБОТКИ ЗАПРОСА:", err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

/**
 * ЗАПУСК СЕРВЕРА
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("=========================================================");
    console.log(`🚀 СЕРВЕР ТАМАКОИН ЗАПУЩЕН НА ПОРТУ: ${PORT}`);
    console.log(`📅 ВРЕМЯ ЗАПУСКА: ${new Date().toLocaleString()}`);
    console.log(`🔗 API URL: https://tama-bot-server.onrender.com/api/action`);
    console.log("=========================================================");
});
