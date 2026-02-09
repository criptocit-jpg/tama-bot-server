const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let users = {};

// Админка: Посмотреть количество игроков
app.get('/api/admin/stats', (req, res) => {
    res.json({ total_players: Object.keys(users).length });
});

app.all('/api/action', async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName, b: 100, energy: 50, boxes: 1, fish: 0,
            artifacts: [], lastBonus: 0, lastUpdate: Date.now()
        };
    }

    const u = users[userId];
    const now = Date.now();

    if (req.method === 'POST') {
        const { action, isDeep, wallet, amount } = req.body;

        // ЕЖЕДНЕВНЫЙ БОНУС
        if (action === 'get_bonus') {
            if (now - u.lastBonus < 86400000) {
                return res.json({ ...u, msg: 'Рано! Таймер еще не вышел.' });
            }
            u.b += 50;
            u.lastBonus = now;
            return res.json({ ...u, msg: 'Получено 50 TC! 💰' });
        }

        // РЫБАЛКА
        if (action === 'catch_fish') {
            const cost = isDeep ? 10 : 2;
            if (u.energy < cost) return res.json({ ...u, msg: 'Молния! Нет энергии ⚡' });
            
            u.energy -= cost;
            
            // Проверка на Золотой Час (19:00 по серверу)
            const hour = new Date().getHours();
            let multiplier = (hour === 19) ? 2 : 1;
            if (isDeep) multiplier *= 10;

            // Шанс на Золотую Рыбку (0.1%)
            if (Math.random() < 0.001) {
                u.b += 5000;
                return res.json({ ...u, isGoldFish: true, msg: 'О БОЖЕ! ЗОЛОТАЯ РЫБКА! +5000 TC! ✨' });
            }

            // Риск глубоководной рыбалки (30% шанс обрыва)
            if (isDeep && Math.random() < 0.3) {
                return res.json({ ...u, msg: 'ОБРЫВ! Леска не выдержала... ❌' });
            }

            let weight = (Math.random() * 5 + 0.5) * multiplier;
            u.fish = (u.fish || 0) + weight;

            // Шанс на артефакт (2%)
            if (Math.random() < 0.02) {
                let artId = Math.floor(Math.random() * 4) + 1;
                if (Math.random() < 0.005) artId = 5; // Пятый - супер редкий
                if (!u.artifacts.includes(artId)) {
                    u.artifacts.push(artId);
                    if (u.artifacts.length === 5) {
                        u.b += 30000;
                        return res.json({ ...u, msg: 'КОЛЛЕКЦИЯ СОБРАНА! +30,000 TC! 🏆' });
                    }
                    return res.json({ ...u, msg: `Выловлен артефакт #${artId}! 🏺` });
                }
            }

            return res.json({ ...u, msg: `Улов: ${weight.toFixed(2)} кг! ${hour===19?'🌟 X2!':''}` });
        }

        if (action === 'sell_fish') {
            let money = u.fish * 0.5;
            u.b += money;
            u.fish = 0;
            return res.json({ ...u, msg: `Продано на ${money.toFixed(1)} TC 💰` });
        }
    }

    res.json(u);
});

app.listen(3000);
