const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Наша база данных
let users = {};

// Админка для тебя (партнерская проверка)
app.get('/api/admin/stats', (req, res) => {
    const count = Object.keys(users).length;
    res.json({ 
        total_players: count,
        online_now: Math.floor(count * 0.1), // Примерный онлайн
        status: "Working" 
    });
});

app.all('/api/action', async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    // Инициализация со всеми полями
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            n: userName,
            b: 100,
            energy: 50,
            boxes: 1,
            fish: 0,
            artifacts: [],
            lastBonus: 0,
            lastUpdate: Date.now()
        };
    }

    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии
    if (now - u.lastUpdate > 600000) { 
        u.energy = Math.min(100, u.energy + 1);
        u.lastUpdate = now;
    }

    if (req.method === 'POST') {
        const { action, isDeep, wallet, amount, id: itemId } = req.body;

        // БОНУС РАЗ В 24 ЧАСА
        if (action === 'get_bonus') {
            const day = 24 * 60 * 60 * 1000;
            if (now - u.lastBonus < day) {
                const remains = day - (now - u.lastBonus);
                return res.json({ ...u, msg: `Бонус через ${Math.floor(remains/3600000)}ч` });
            }
            u.b += 50;
            u.lastBonus = now;
            return res.json({ ...u, msg: 'Ежедневный бонус 50 TC получен! 💰' });
        }

        // РЫБАЛКА
        if (action === 'catch_fish') {
            const cost = isDeep ? 10 : 2;
            if (u.energy < cost) return res.json({ ...u, msg: 'Недостаточно энергии! ⚡' });
            
            u.energy -= cost;
            const hour = new Date().getHours();
            let multiplier = (hour === 19) ? 2 : 1; // Тот самый Золотой Стандарт
            
            if (isDeep) multiplier *= 10;

            // ЗОЛОТАЯ РЫБКА (0.1%)
            if (Math.random() < 0.001) {
                u.b += 5000;
                return res.json({ ...u, isGoldFish: true, msg: 'ЛЕГЕНДАРНАЯ ЗОЛОТАЯ РЫБКА! +5000 TC! ✨👑' });
            }

            // ШАНС ОБРЫВА ПРИ РИСКЕ
            if (isDeep && Math.random() < 0.3) {
                return res.json({ ...u, msg: 'ОБРЫВ! Глубоководная рыба сорвалась... ❌' });
            }

            let weight = (Math.random() * 5 + 0.5) * multiplier;
            u.fish = (u.fish || 0) + weight;

            // АРТЕФАКТЫ (2%)
            if (Math.random() < 0.02) {
                let artId = Math.floor(Math.random() * 4) + 1;
                if (Math.random() < 0.005) artId = 5; // Сверхредкий 5-й элемент
                if (!u.artifacts.includes(artId)) {
                    u.artifacts.push(artId);
                    if (u.artifacts.length === 5) {
                        u.b += 30000;
                        return res.json({ ...u, msg: 'КОЛЛЕКЦИЯ СОБРАНА! +30,000 TC! 🏆🏺' });
                    }
                    return res.json({ ...u, msg: `Вы нашли часть артефакта #${artId}!` });
                }
            }
            return res.json({ ...u, msg: `Улов: ${weight.toFixed(2)} кг! ${hour===19?'🌟 (Золотой час x2)':''}` });
        }

        if (action === 'sell_fish') {
            if (u.fish <= 0) return res.json({ ...u, msg: 'Сумка пуста' });
            let money = u.fish * 0.5; // Твой курс 0.5
            u.b += money;
            u.fish = 0;
            return res.json({ ...u, msg: `Продано! +${money.toFixed(1)} TC` });
        }
    }
    res.json(u);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
