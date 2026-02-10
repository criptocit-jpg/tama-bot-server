const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

const DB_FILE = './database.json';
let users = {};

// Загрузка базы при старте сервера
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.log("Ошибка чтения БД, создаем новую");
        users = {};
    }
}

// Функция сохранения базы
const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
};

// АДМИНКА (по адресу /api/admin/stats)
app.get('/api/admin/stats', (req, res) => {
    const players = Object.values(users);
    res.json({
        total_players: players.length,
        banned_users: players.filter(u => u.isBanned).map(u => ({id: u.id, name: u.n})),
        top_balances: players.sort((a,b) => b.b - a.b).slice(0, 10).map(u => ({n: u.n, b: u.b}))
    });
});

app.post('/api/action', (req, res) => {
    const { userId, userName, action, isDeep, captchaPassed, amount } = req.body;
    if (!userId) return res.status(400).send('No ID');

    // Инициализация нового юзера
    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100, energy: 50, fish: 0,
            artifacts: [], boxes: 1, lastBonus: 0, isBanned: false, failCount: 0, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Проверка на бан
    if (u.isBanned) {
        return res.json({ ...u, msg: "ДОСТУП ЗАКРЫТ: ВЫ ЗАБАНЕНЫ ЗА ИСПОЛЬЗОВАНИЕ БОТОВ!" });
    }

    const now = Date.now();

    // Регенерация энергии
    if (now - u.lastUpdate > 300000) { 
        const recovered = Math.floor((now - u.lastUpdate) / 300000);
        u.energy = Math.min(100, u.energy + recovered);
        u.lastUpdate = now;
    }

    // ЛОГИКА ДЕЙСТВИЙ
    if (action === 'catch_fish') {
        // Проверка "подсечки" (защита от ботов)
        if (!captchaPassed) {
            u.failCount++;
            if (u.failCount >= 3) {
                u.isBanned = true;
                saveDB();
                return res.json({ ...u, msg: "ОБНАРУЖЕНО ИСПОЛЬЗОВАНИЕ СКРИПТОВ. ВЫ ЗАБАНЕНЫ!" });
            }
            return res.json({ ...u, msg: "РЫБА УШЛА! НУЖНО ПОДСЕКАТЬ (КЛИКАТЬ ПО РЫБЕ)!" });
        }

        u.failCount = 0; // Сброс счетчика при успехе
        const cost = isDeep ? 10 : 2;
        if (u.energy < cost) return res.json({ ...u, msg: "НЕДОСТАТОЧНО ЭНЕРГИИ!" });

        u.energy -= cost;
        let weight = (Math.random() * 5 + 0.5) * (isDeep ? 10 : 1);
        
        // Золотой час (19:00)
        const hour = new Date().getHours();
        if (hour === 19) weight *= 2;

        u.fish += weight;
        
        // Шанс на артефакт
        if (Math.random() < 0.05) {
            const artId = Math.floor(Math.random() * 5) + 1;
            if (!u.artifacts.includes(artId)) {
                u.artifacts.push(artId);
                if (u.artifacts.length === 5) u.b += 30000;
            }
        }

        saveDB();
        return res.json({ ...u, msg: `УДАЧНЫЙ ЗАБРОС! ВЫЛОВЛЕНО: ${weight.toFixed(2)} КГ.` });
    }

    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: "САДОК ПУСТ!" });
        const reward = u.fish * 0.5;
        u.b += reward;
        u.fish = 0;
        saveDB();
        return res.json({ ...u, msg: `РЫБА ПРОДАНА ЗА ${reward.toFixed(1)} TC!` });
    }

    if (action === 'get_bonus') {
        if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: "РАНО! БОНУС ЕЩЕ НЕ ГОТОВ." });
        u.b += 50;
        u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: "ЕЖЕДНЕВНЫЙ БОНУС 50 TC ПОЛУЧЕН!" });
    }

    if (action === 'withdraw') {
        if (u.b < 30000) return res.json({ ...u, msg: "МИНИМАЛЬНАЯ СУММА ВЫВОДА — 30,000 TC!" });
        u.b -= amount;
        saveDB();
        return res.json({ ...u, msg: "ЗАЯВКА НА ВЫВОД ПРИНЯТА!" });
    }

    res.json(u);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
