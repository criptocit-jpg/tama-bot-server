const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ПУТЬ К БАЗЕ ДАННЫХ
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

// ГЛУБОКАЯ ЗАГРУЗКА БАЗЫ
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
            console.log("--- БАЗА ДАННЫХ ЗАГРУЖЕНА УСПЕШНО ---");
        } catch (e) {
            console.error("ОШИБКА ЧТЕНИЯ БД:", e);
            users = {};
        }
    } else {
        console.log("--- СОЗДАНА НОВАЯ БАЗА ДАННЫХ ---");
        users = {};
    }
}

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
    } catch (e) {
        console.error("ОШИБКА СОХРАНЕНИЯ БД:", e);
    }
};

loadDatabase();

// СИСТЕМА УРОВНЕЙ (6 СТУПЕНЕЙ)
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
app.post('/api/admin/power', (req, res) => {
    const { adminKey, targetId, action, value } = req.body;
    
    // Секретный ключ, который ты можешь поменять
    if (adminKey !== 'твой_секретный_ключ_777') {
        return res.status(403).json({ error: 'ДОСТУП ЗАПРЕЩЕН' });
    }

    const u = users[targetId];
    if (!u) return res.status(404).json({ error: 'Рыбак не найден' });

    if (action === 'give_money') {
        u.b = (u.b || 0) + parseFloat(value);
        u.totalEarned = (u.totalEarned || 0) + parseFloat(value);
    }
    if (action === 'set_energy') u.energy = parseInt(value);
    if (action === 'ban') u.isBanned = true;
    if (action === 'unban') u.isBanned = false;
    if (action === 'reset_durability') u.durability = 100;

    saveDB();
    console.log(`АДМИН ДЕЙСТВИЕ: ${action} для пользователя ${targetId}`);
    res.json({ success: true, user: u });
});

// ОСНОВНОЙ ОБРАБОТЧИК ДЕЙСТВИЙ
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId } = req.body;
    
    if (!userId) return res.status(400).json({ error: 'ID пользователя отсутствует' });

    // ИНИЦИАЛИЗАЦИЯ ИЛИ ПРОВЕРКА ПОЛЯ
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
    if (u.isBanned) return res.json({ msg: "ВАШ АККАУНТ ЗАБЛОКИРОВАН 🚫" });

    const now = Date.now();
    const dateObj = new Date();
    const isGoldHour = dateObj.getHours() === 19; // Золотой час ровно в 19:00

    // РЕГЕНЕРАЦИЯ ЭНЕРГИИ (2 единицы каждые 10 минут)
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 600000) {
        const energyToRestore = Math.floor(timePassed / 600000) * 2;
        u.energy = Math.min(100, (u.energy || 0) + energyToRestore);
        u.lastUpdate = now;
    }

    // --- ЛОГИКА ДЕЙСТВИЙ ---

    // 1. РЫБАЛКА
    if (action === 'catch_fish') {
        // Проверка капчи (мешочка)
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) {
            return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! ПОПРОБУЙ СНОВА 🛑' });
        }
        
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕДОСТАТОЧНО ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! ТРЕБУЕТСЯ РЕМОНТ 🛠️' });

        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        // Шанс обрыва лески (5%)
        if (Math.random() < 0.05) {
            u.durability -= 5;
            saveDB();
            return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! УДОЧКА ПОВРЕЖДЕНА 💥' });
        }

        // Шанс осечки (пустой заброс) - 25%
        if (Math.random() < 0.25) {
            saveDB();
            return res.json({ ...u, msg: 'ПУСТО... РЫБА УШЛА НА ДНО 🌊' });
        }

        // Удачный улов
        let weight = (Math.random() * 2.5 + 0.2); 
        if (isGoldHour) weight *= 2;
        
        u.fish += weight;
        let finalMsg = `ВЫ ПОЙМАЛИ РЫБУ: ${weight.toFixed(2)} КГ! 🎣`;
        
        // Шанс найти ящик (3%)
        if (Math.random() < 0.03) {
            u.boxes++;
            finalMsg = `УЛОВ: ${weight.toFixed(2)} КГ + СЕКРЕТНЫЙ ЯЩИК! 🎁`;
        }

        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: finalMsg });
    }

    // 2. ПРОДАЖА
    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'ВАША СУМКА ПУСТА!' });
        
        let earned = Math.floor(u.fish * 10); // 1 кг = 10 TC
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: `РЫБА ПРОДАНА! ПОЛУЧЕНО: ${earned} TC 💰` });
    }

    // 3. ЕЖЕДНЕВНЫЙ БОНУС
    if (action === 'get_daily') {
        if (now - (u.lastBonus || 0) < 86400000) {
            return res.json({ ...u, msg: 'БОНУС ЕЩЕ НЕ ПОДГОТОВЛЕН!' });
        }
        u.b += 100;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'ЕЖЕДНЕВНЫЙ БОНУС ПОЛУЧЕН! +100 TC ✨' });
    }

    // 4. МАГАЗИН И ПРЕДМЕТЫ
    if (action === 'buy_item') {
        const today = dateObj.toLocaleDateString();
        if (u.lastEnergyDate !== today) {
            u.dailyEnergyDrunk = 0;
            u.lastEnergyDate = today;
        }

        if (itemId === 'energy') {
            if (u.dailyEnergyDrunk >= 3) return res.json({ ...u, msg: 'ЛИМИТ ЭНЕРГЕТИКОВ (3/ДЕНЬ) ИСЧЕРПАН! 🤢' });
            if (u.b < 500) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC ДЛЯ ПОКУПКИ ЭНЕРГЕТИКА!' });
            
            u.b -= 500;
            u.energy = Math.min(100, u.energy + 30);
            u.dailyEnergyDrunk++;
            saveDB();
            return res.json({ ...u, msg: `ЭНЕРГЕТИК КУПЛЕН! ИСПОЛЬЗОВАНО ${u.dailyEnergyDrunk}/3` });
        }

        if (itemId === 'titan') {
            if (u.b < 1000) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC НА ТИТАНОВУЮ ЛЕСКУ!' });
            u.b -= 1000;
            // Здесь можно добавить флаг защиты, если решишь внедрить
            saveDB();
            return res.json({ ...u, msg: 'ТИТАНОВАЯ ЛЕСКА УСТАНОВЛЕНА! (В РАЗРАБОТКЕ)' });
        }
    }

    // 5. РЕМОНТ УДОЧКИ
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'ДЛЯ РЕМОНТА НУЖНО 50 TC!' });
        u.b -= 50;
        u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА ВОССТАНОВЛЕНА ДО 100%! 🛠️' });
    }

    // 6. ОТКРЫТИЕ ЯЩИКА
    if (action === 'open_box') {
        if (!u.boxes || u.boxes <= 0) return res.json({ ...u, msg: 'У ВАС НЕТ ДОСТУПНЫХ ЯЩИКОВ!' });
        u.boxes--;
        let prize = Math.floor(Math.random() * 800) + 100;
        u.b += prize;
        u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, msg: `ИЗ ЯЩИКА ВЫПАЛО: ${prize} TC! ✨` });
    }

    // ФОРМИРОВАНИЕ ТОПА
    const top = Object.values(users)
        .sort((a, b) => b.b - a.b)
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    // ОТВЕТ ПО УМОЛЧАНИЮ (LOAD DATA)
    res.json({ 
        ...u, 
        level: getLevel(u.totalEarned), 
        top: top,
        serverTime: now 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`--- СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT} ---`);
    console.log(`--- ТАМАКОИН БАЗА ГОТОВА К РАБОТЕ ---`);
});
