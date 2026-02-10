const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ПУТЬ К БАЗЕ ДАННЫХ (чтобы ничего не пропадало)
const DB_FILE = path.join(__dirname, 'database.json');
let users = {};

// 1. ЗАГРУЗКА БАЗЫ ПРИ ЗАПУСКЕ
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log("БД загружена. Игроков в базе:", Object.keys(users).length);
    } catch (e) { 
        console.log("Ошибка БД, создаем новую");
        users = {}; 
    }
}

// 2. ФУНКЦИЯ СОХРАНЕНИЯ (Вызывать после каждого изменения!)
const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
};

const API_ACTION = '/api/action';

app.get('/', (req, res) => res.send('Tamacoin API 3.5.8 Active'));

app.all(API_ACTION, async (req, res) => {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    const userName = req.method === 'POST' ? req.body.userName : 'Рыбак';
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    // Инициализация пользователя
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            n: userName,
            b: 100,      // Баланс
            energy: 50,  // Энергия
            boxes: 1,    // Ящики
            fish: 0,     // Вес
            castCount: 0, // Счетчик забросов для капчи
            lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];

    // Регенерация энергии (раз в 10 минут +1)
    const now = Date.now();
    if (now - u.lastUpdate > 600000) {
        u.energy = Math.min(100, u.energy + 1);
        u.lastUpdate = now;
        saveDB();
    }

    if (req.method === 'POST') {
        const { action, wallet, amount, id: itemId, captchaPassed } = req.body;

        // --- ЛОГИКА РЫБАЛКИ ---
        if (action === 'catch_fish') {
            // Проверка на капчу (каждый 5-й раз)
            const isCaptchaStep = (u.castCount + 1) % 5 === 0;
            if (isCaptchaStep && !captchaPassed) {
                return res.json({ ...u, msg: 'Рыба сорвалась! Не нажал мешочек 🛑' });
            }

            if (u.energy <= 0) return res.json({ ...u, msg: 'Нет энергии! ⚡' });
            
            u.energy -= 2;
            u.castCount = (u.castCount || 0) + 1;
            
            let weight = (Math.random() * 5 + 0.5); 
            u.fish = (u.fish || 0) + weight;
            
            let responseMsg = `Поймал рыбу: ${weight.toFixed(2)} кг! 🎣`;
            
            // Шанс на ящик 10%
            if (Math.random() < 0.1) {
                u.boxes += 1;
                responseMsg = `Поймал ${weight.toFixed(2)}кг и нашел ЯЩИК! 🎁`;
            }
            
            saveDB();
            return res.json({ ...u, msg: responseMsg });
        }

        // --- ПРОДАЖА ---
        if (action === 'sell_fish') {
            if (!u.fish || u.fish <= 0) return res.json({ ...u, msg: 'Рыбы нет на продажу' });
            let money = u.fish * 10; 
            u.b += money;
            u.fish = 0;
            saveDB();
            return res.json({ ...u, msg: `Продано! Получено ${money.toFixed(0)} TC 💰` });
        }

        // --- ЯЩИКИ ---
        if (action === 'open_box') {
            if (u.boxes <= 0) return res.json({ ...u, msg: 'Ящиков нет' });
            u.boxes -= 1;
            let prize = Math.floor(Math.random() * 5000) + 100;
            u.b += prize;
            saveDB();
            return res.json({ ...u, msg: `В ящике было ${prize} TC! ✨` });
        }

        // --- МАГАЗИН STARS ---
        if (action === 'buy_stars') {
            if (itemId === 'energy_pack') { 
                u.energy += 30; 
                saveDB();
                return res.json({ ...u, msg: '+30 Энергии куплено!' }); 
            }
            return res.json({ ...u, msg: 'Тестовый режим Stars' });
        }

        // --- ВЫВОД ---
        if (action === 'withdraw') {
            if (u.b < 30000) return res.json({ ...u, msg: 'Минимум 30,000 TC!' });
            if (amount > u.b) return res.json({ ...u, msg: 'Недостаточно средств!' });
            u.b -= amount;
            saveDB();
            return res.json({ ...u, msg: 'Заявка принята! Ожидайте выплату 💳' });
        }
    }

    // ТОП 10
    const top = Object.values(users)
        .sort((a, b) => (b.b || 0) - (a.b || 0))
        .slice(0, 10)
        .map(user => ({ n: user.n, b: user.b }));

    res.json({ ...u, top });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Tamacoin Gold 3.5.8 on port ${PORT}`));
