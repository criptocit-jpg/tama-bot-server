const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let users = {};

// АДМИНКА
app.get('/api/admin/stats', (req, res) => {
    res.json({ 
        total_players: Object.keys(users).length,
        users: Object.values(users).map(u => ({ id: u.id, n: u.n, b: u.b, refs: u.refs?.length || 0 }))
    });
});

app.all('/api/action', async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    const refId = req.query.ref; // Для рефералки
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName, b: 100, energy: 50, fish: 0,
            artifacts: [], boxes: 1, refs: [], lastBonus: 0, lastUpdate: Date.now()
        };
        // Логика реферала
        if (refId && users[refId] && refId !== userId) {
            users[refId].refs.push(userId);
            users[refId].boxes += 1; // Даем коробку за друга
        }
    }

    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии
    if (now - u.lastUpdate > 300000) {
        u.energy = Math.min(100, u.energy + Math.floor((now - u.lastUpdate) / 300000));
        u.lastUpdate = now;
    }

    if (req.method === 'POST') {
        const { action, isDeep, wallet, amount, itemId } = req.body;

        // ВЫВОД
        if (action === 'withdraw') {
            if (u.b < 30000) return res.json({ ...u, msg: 'Минимум 30,000 TC!' });
            u.b -= amount;
            return res.json({ ...u, msg: `Заявка на ${amount} TC создана! Ожидайте.` });
        }

        // МАГАЗИН (Заглушка Stars)
        if (action === 'buy_item') {
            return res.json({ ...u, msg: 'Оплата Stars временно через бота @admin' });
        }

        // ЕЖЕДНЕВНЫЙ БОНУС
        if (action === 'get_bonus') {
            if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: 'Рано!' });
            u.b += 50; u.lastBonus = now;
            return res.json({ ...u, msg: 'Получено 50 TC!' });
        }

        // РЫБАЛКА
        if (action === 'catch_fish') {
            const cost = isDeep ? 10 : 2;
            if (u.energy < cost) return res.json({ ...u, msg: 'Нет энергии!' });
            u.energy -= cost;
            const hour = new Date().getHours();
            let mult = (hour === 19) ? 2 : 1;
            if (isDeep) mult *= 10;

            if (Math.random() < 0.001) { u.b += 5000; return res.json({ ...u, isGoldFish: true, msg: 'ЗОЛОТАЯ РЫБКА! +5000 TC!' }); }
            if (isDeep && Math.random() < 0.3) return res.json({ ...u, msg: 'ОБРЫВ!' });

            let weight = (Math.random() * 5 + 0.5) * mult;
            u.fish += weight;
            return res.json({ ...u, msg: `Улов: ${weight.toFixed(2)} кг!` });
        }

        if (action === 'sell_fish') {
            let reward = u.fish * 0.5;
            u.b += reward; u.fish = 0;
            return res.json({ ...u, msg: `Продано за ${reward.toFixed(1)} TC` });
        }
    }
    res.json(u);
});

app.listen(process.env.PORT || 3000);
