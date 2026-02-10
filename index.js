const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let users = {};

// Админка
app.get('/api/admin/stats', (req, res) => {
    res.json({ total_players: Object.keys(users).length });
});

app.all('/api/action', async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName, b: 100, energy: 50, fish: 0,
            artifacts: [], lastBonus: 0, lastUpdate: Date.now()
        };
    }

    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии (1 ед в 5 минут)
    const passed = now - u.lastUpdate;
    if (passed > 300000) {
        const add = Math.floor(passed / 300000);
        u.energy = Math.min(100, u.energy + add);
        u.lastUpdate = now;
    }

    if (req.method === 'POST') {
        const { action, isDeep } = req.body;

        if (action === 'get_bonus') {
            if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: 'Бонус еще не готов' });
            u.b += 50;
            u.lastBonus = now;
            return res.json({ ...u, msg: 'Получено 50 TC! 💰' });
        }

        if (action === 'catch_fish') {
            const cost = isDeep ? 10 : 2;
            if (u.energy < cost) return res.json({ ...u, msg: 'Нет энергии! ⚡' });
            u.energy -= cost;

            const hour = new Date().getHours();
            let mult = (hour === 19) ? 2 : 1;
            if (isDeep) mult *= 10;

            if (Math.random() < 0.001) {
                u.b += 5000;
                return res.json({ ...u, isGoldFish: true, msg: 'ЗОЛОТАЯ РЫБКА! +5000 TC! ✨' });
            }

            if (isDeep && Math.random() < 0.3) return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! ❌' });

            let weight = (Math.random() * 5 + 0.5) * mult;
            u.fish += weight;

            // Артефакты
            if (Math.random() < 0.02) {
                let artId = Math.random() < 0.01 ? 5 : Math.floor(Math.random() * 4) + 1;
                if (!u.artifacts.includes(artId)) {
                    u.artifacts.push(artId);
                    if (u.artifacts.length === 5) u.b += 30000;
                }
            }
            return res.json({ ...u, msg: `Поймано: ${weight.toFixed(2)} кг!` });
        }

        if (action === 'sell_fish') {
            if (u.fish <= 0) return res.json({ ...u, msg: 'Садок пуст' });
            let reward = u.fish * 0.5;
            u.b += reward;
            u.fish = 0;
            return res.json({ ...u, msg: `Продано на ${reward.toFixed(1)} TC! 💰` });
        }
    }
    res.json(u);
});

app.listen(process.env.PORT || 3000);
