const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

if (fs.existsSync(DB_FILE)) {
    try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { users = {}; }
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));

const getLevel = (total) => {
    const t = total || 0;
    if (t > 500000) return "ПОСЕЙДОН 🔱";
    if (t > 150000) return "МОРСКОЙ ВОЛК 🐺";
    if (t > 50000) return "КАПИТАН 👨‍✈️";
    if (t > 15000) return "РЫБОЛОВ-ПРО 🎣";
    if (t > 5000) return "ЛЮБИТЕЛЬ 🐡";
    return "САЛАГА 🌱";
};

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId } = req.body;
    if (!userId) return res.status(400).json({ error: 'No ID' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100, energy: 50, boxes: 1, fish: 0,
            castCount: 0, durability: 100, totalEarned: 0, lastBonus: 0, 
            dailyEnergyDrunk: 0, lastEnergyDate: "", isBanned: false, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];
    const isGoldHour = new Date().getHours() === 19;

    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК УПЛЫЛ! 🛑' });
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        u.energy -= 2; u.durability -= 1; u.castCount++;
        
        if (Math.random() < 0.05) { u.durability -= 5; saveDB(); return res.json({ ...u, msg: 'ОБРЫВ ЛЕСКИ! 💥' }); }
        if (Math.random() < 0.3) { saveDB(); return res.json({ ...u, msg: 'НЕ КЛЮНУЛО... 🌊' }); }

        let w = (Math.random() * 2 + 0.1); // Снизил вес для баланса
        if (isGoldHour) w *= 2;
        u.fish += w;
        let msg = `УЛОВ: ${w.toFixed(2)} КГ! 🎣`;
        if (Math.random() < 0.03) { u.boxes++; msg += " + 🎁"; }
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg });
    }

    if (action === 'sell_fish') {
        if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА!' });
        let m = Math.floor(u.fish * 10);
        u.b += m; u.totalEarned += m; u.fish = 0;
        saveDB();
        return res.json({ ...u, level: getLevel(u.totalEarned), msg: `ПРОДАНО ЗА ${m} TC!` });
    }

    if (action === 'get_daily') {
        const now = Date.now();
        if (now - (u.lastBonus || 0) < 86400000) return res.json({ ...u, msg: 'ЕЩЕ НЕ ВРЕМЯ!' });
        u.b += 100; u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: '+100 TC БОНУС! ✨' });
    }

    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'НУЖНО 50 TC!' });
        u.b -= 50; u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'ПОЧИНЕНО! 🛠️' });
    }

    if (action === 'buy_item' && itemId === 'energy') {
        const today = new Date().toLocaleDateString();
        if (u.lastEnergyDate !== today) { u.dailyEnergyDrunk = 0; u.lastEnergyDate = today; }
        if (u.dailyEnergyDrunk >= 3) return res.json({ ...u, msg: 'ЛИМИТ 3 БАНКИ В ДЕНЬ!' });
        if (u.b < 500) return res.json({ ...u, msg: 'НУЖНО 500 TC!' });
        u.b -= 500; u.energy = Math.min(100, u.energy + 30); u.dailyEnergyDrunk++;
        saveDB();
        return res.json({ ...u, msg: `КУПЛЕНО! (${u.dailyEnergyDrunk}/3)` });
    }

    if (action === 'open_box') {
        if (!u.boxes) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ!' });
        u.boxes--; let p = Math.floor(Math.random() * 500) + 50;
        u.b += p; u.totalEarned += p;
        saveDB();
        return res.json({ ...u, msg: `ПРИЗ: ${p} TC!` });
    }

    const top = Object.values(users).sort((a,b)=>b.b-a.b).slice(0,10).map(x=>({n:x.n, b:x.b}));
    res.json({ ...u, level: getLevel(u.totalEarned), top });
});

app.listen(process.env.PORT || 3000);
