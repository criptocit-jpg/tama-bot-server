const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// ВКЛЮЧАЕМ CORS ДЛЯ СВЯЗИ С ФРОНТЕНДОМ
app.use(cors());
app.use(express.json());

// ПУТЬ К ФАЙЛУ БАЗЫ ДАННЫХ
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

// ГЛУБОКАЯ ЗАГРУЗКА БАЗЫ ДАННЫХ ПРИ СТАРТЕ
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log("-----------------------------------------");
            console.log("БАЗА ДАННЫХ ЗАГРУЖЕНА УСПЕШНО [v3.6.4]");
            console.log("-----------------------------------------");
        } catch (e) {
            console.error("КРИТИЧЕСКАЯ ОШИБКА ЧТЕНИЯ БД:", e);
            users = {};
        }
    } else {
        console.log("-----------------------------------------");
        console.log("СОЗДАНА НОВАЯ БАЗА ДАННЫХ (ФАЙЛ ОТСУТСТВОВАЛ)");
        console.log("-----------------------------------------");
        users = {};
    }
}

// ФУНКЦИЯ СОХРАНЕНИЯ БАЗЫ (С ПРОВЕРКОЙ ОШИБОК)
const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
    } catch (e) {
        console.error("ОШИБКА ПРИ ЗАПИСИ В ФАЙЛ database.json:", e);
    }
};

// ВЫЗОВ ЗАГРУЗКИ ПРИ ЗАПУСКЕ СЕРВЕРА
loadDatabase();

// СИСТЕМА УРОВНЕЙ (ОПРЕДЕЛЕНИЕ СТАТУСА ПО ОБЩЕМУ ЗАРАБОТКУ)
const getLevel = (total) => {
    const t = total || 0;
    if (t > 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (t > 500000) return "ПОСЕЙДОН 🌊";
    if (t > 150000) return "МОРСКОЙ ВОЛК 🐺";
    if (t > 50000) return "КАПИТАН 👨‍✈️";
    if (t > 15000) return "РЫБОЛОВ-ПРО 🎣";
    if (t > 5000) return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

// --- АДМИН-ПАНЕЛЬ (РЕЖИМ БОГА) ---
// POST запрос на /api/admin/power с ключом adminKey
app.post('/api/admin/power', (req, res) => {
    const { adminKey, targetId, action, value } = req.body;
    
    // Секретный ключ для управления проектом
    if (adminKey !== 'super_secret_key_777') {
        return res.status(403).json({ error: 'ОТКАЗАНО В ДОСТУПЕ' });
    }

    const u = users[targetId];
    if (!u) return res.status(404).json({ error: 'ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН' });

    if (action === 'give_money') {
        u.b = (u.b || 0) + parseFloat(value);
        u.totalEarned = (u.totalEarned || 0) + parseFloat(value);
    }
    if (action === 'set_energy') u.energy = parseInt(value);
    if (action === 'ban') u.isBanned = true;
    if (action === 'unban') u.isBanned = false;
    if (action === 'reset_durability') u.durability = 100;
    if (action === 'set_boxes') u.boxes = parseInt(value);

    saveDB();
    console.log(`АДМИН-ДЕЙСТВИЕ: ${action} для ID: ${targetId} выполнено успешно.`);
    res.json({ success: true, user: u });
});

// ГЛАВНЫЙ ОБРАБОТЧИК ДЕЙСТВИЙ ИГРОКА
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId, wallet, amount } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId обязателен' });
    }

    // ИНИЦИАЛИЗАЦИЯ ИЛИ ПРОВЕРКА ПОЛЕЙ ПОЛЬЗОВАТЕЛЯ (НИКОГДА НЕ УДАЛЯЕМ ДАННЫЕ)
    if (!users[userId]) {
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
            dailyEnergyDrunk: 0,
            lastEnergyDate: "",
            isBanned: false,
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // ПРОВЕРКА НА БАН
    if (u.isBanned) {
        return res.json({ msg: "ВАШ АККАУНТ ЗАБЛОКИРОВАН 🚫", isBanned: true });
    }

    const now = Date.now();
    const dateObj = new Date();
    const isGoldHour = dateObj.getHours() === 19; // Золотой час в 19:00 по серверу

    // РЕГЕНЕРАЦИЯ ЭНЕРГИИ (+2 единицы каждые 10 минут)
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 600000) {
        const energyToRestore = Math.floor(timePassed / 600000) * 2;
        u.energy = Math.min(100, (u.energy || 0) + energyToRestore);
        u.lastUpdate = now;
        // Сохраним прогресс регенерации
        saveDB();
    }

    // --- ЛОГИКА ДЕЙСТВИЙ (SWITCH/CASE ИЛИ IF) ---

    // 1. РЫБАЛКА (ОСНОВНОЙ ГЕЙМПЛЕЙ)
    if (action === 'catch_fish') {
        // Проверка капчи (мешочек на 5-й раз)
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! ПОПРОБУЙ СНОВА 🛑' });
        }
        
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! ТРЕБУЕТСЯ РЕМОНТ 🛠️' });

        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        // Шанс обрыва лески (5% вероятность)
        if (Math.random() < 0.05) {
            u.durability -= 5;
            saveDB();
            return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! УДОЧКА ПОВРЕЖДЕНА 💥' });
        }

        // Шанс осечки (пустой клёв) - 25% вероятность
        if (Math.random() < 0.25) {
            saveDB();
            return res.json({ ...u, msg: 'НЕ КЛЮНУЛО... РЫБА УШЛА 🌊' });
        }

        // РАСЧЕТ ВЕСА РЫБЫ (БАЛАНСИРОВКА)
        let weight = (Math.random() * 2.5 + 0.2); 
        if (isGoldHour) weight *= 2; // X2 в золотой час
        
        u.fish += weight;
        let finalMsg = `ВЫ ПОЙМАЛИ РЫБУ: ${weight.toFixed(2)} КГ! 🎣`;
        
        // Шанс найти секретный ящик (3%)
        if (Math.random() < 0.03) {
            u.boxes++;
            finalMsg = `УЛОВ: ${weight.toFixed(2)} КГ + СЕКРЕТНЫЙ ЯЩИК! 🎁`;
        }

        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: finalMsg });
    }

    // 2. ПРОДАЖА УЛОВА (1 КГ = 10 TC)
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) {
            return res.json({ ...u, msg: 'ВАША СУМКА ПУСТА!' });
        }
        
        let earned = Math.floor(u.fish * 10);
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: `РЫБА ПРОДАНА! ПОЛУЧЕНО: ${earned} TC 💰` });
    }

    // 3. ЕЖЕДНЕВНЫЙ БОНУС (РАЗ В 24 ЧАСА)
    if (action === 'get_daily') {
        const bonusCooldown = 86400000; // 24 часа в мс
        if (now - (u.lastBonus || 0) < bonusCooldown) {
            return res.json({ ...u, msg: 'БОНУС ЕЩЕ НЕ ПОДГОТОВЛЕН!' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ЕЖЕДНЕВНЫЙ БОНУС ПОЛУЧЕН! +100 TC ✨' });
    }

    // 4. МАГАЗИН (ЭНЕРГЕТИКИ И ПРЕДМЕТЫ)
    if (action === 'buy_item') {
        const today = dateObj.toLocaleDateString();
        
        // Сброс лимита банок в новый день
        if (u.lastEnergyDate !== today) {
            u.dailyEnergyDrunk = 0;
            u.lastEnergyDate = today;
        }

        if (itemId === 'energy') {
            if (u.dailyEnergyDrunk >= 3) {
                return res.json({ ...u, msg: 'ЛИМИТ ЭНЕРГЕТИКОВ (3 В ДЕНЬ) ИСЧЕРПАН! 🤢' });
            }
            if (u.b < 500) {
                return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC ДЛЯ ПОКУПКИ ЭНЕРГЕТИКА!' });
            }
            
            u.b -= 500;
            u.energy = Math.min(100, (u.energy || 0) + 30);
            u.dailyEnergyDrunk++;
            saveDB();
            return res.json({ ...u, msg: `ЭНЕРГЕТИК КУПЛЕН! ИСПОЛЬЗОВАНО ${u.dailyEnergyDrunk}/3` });
        }

        if (itemId === 'titan') {
            if (u.b < 1000) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC НА ТИТАНОВУЮ ЛЕСКУ!' });
            u.b -= 1000;
            // Логика защиты прочности может быть добавлена здесь
            saveDB();
            return res.json({ ...u, msg: 'ТИТАНОВАЯ ЛЕСКА УСТАНОВЛЕНА!' });
        }
    }

    // 5. РЕМОНТ УДОЧКИ (ЦЕНА 50 TC)
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'ДЛЯ РЕМОНТА НУЖНО 50 TC!' });
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА ВОССТАНОВЛЕНА ДО 100%! 🛠️' });
    }

    // 6. ОТКРЫТИЕ СЕКРЕТНОГО ЯЩИКА
    if (action === 'open_box') {
        if (!u.boxes || u.boxes <= 0) {
            return res.json({ ...u, msg: 'У ВАС НЕТ ДОСТУПНЫХ ЯЩИКОВ!' });
        }
        u.boxes--;
        let prize = Math.floor(Math.random() * 800) + 100;
        u.b += prize;
        u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, msg: `ИЗ ЯЩИКА ВЫПАЛО: ${prize} TC! ✨` });
    }

    // 7. ВЫВОД СРЕДСТВ (НОВОЕ!)
    if (action === 'withdraw') {
        if (!wallet || wallet.length < 10) {
            return res.json({ ...u, msg: 'УКАЖИТЕ КОРРЕКТНЫЙ TON АДРЕС!' });
        }
        const withdrawAmount = parseFloat(amount);
        if (isNaN(withdrawAmount) || withdrawAmount < 30000) {
            return res.json({ ...u, msg: 'МИНИМАЛЬНЫЙ ВЫВОД: 30,000 TC!' });
        }
        if (u.b < withdrawAmount) {
            return res.json({ ...u, msg: 'НЕДОСТАТОЧНО СРЕДСТВ НА БАЛАНСЕ!' });
        }

        u.b -= withdrawAmount;
        saveDB();
        
        // Запись в консоль для администратора (можно вынести в отдельный файл logs.txt)
        console.log(`[ВЫВОД] Игрок: ${u.n} | ID: ${userId} | Сумма: ${withdrawAmount} | Кошелек: ${wallet}`);
        
        return res.json({ ...u, msg: 'ЗАЯВКА НА ВЫВОД ПРИНЯТА В ОБРАБОТКУ! ✅' });
    }

    // 8. ЗАГРУЗКА ДАННЫХ (LOAD_DATA)
    if (action === 'load_data') {
        console.log(`Загрузка профиля: ${u.n} (ID: ${userId})`);
    }

    // ПОДГОТОВКА ТОП-10 ИГРОКОВ (ПО ТЕКУЩЕМУ БАЛАНСУ)
    const top = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    // ОТВЕТ СЕРВЕРА (АКТУАЛЬНЫЕ ДАННЫЕ)
    res.json({ 
        ...u, 
        level: getLevel(u.totalEarned), 
        top: top,
        serverTime: now 
    });
});

// ЗАПУСК СЕРВЕРА
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("=========================================");
    console.log(`СЕРВЕР TAMACOIN ЗАПУЩЕН НА ПОРТУ: ${PORT}`);
    console.log("ОЖИДАНИЕ ЗАПРОСОВ ОТ РЫБАКОВ...");
    console.log("=========================================");
});
