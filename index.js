const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("📡 СИСТЕМА: Ядро v4.3.0 запущенно без сокращений.");
} catch (e) { console.error(e); }

let users = {};
function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (err) { users = {}; }
    }
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
loadDB();

const getLevel = (total) => {
    const s = total || 0;
    if (s >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (s >= 500000) return "МОРСКОЙ ВОЛК 🐺";
    if (s >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (s >= 50000) return "КАПИТАН 👨‍✈️";
    if (s >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// Обработка кнопки "Оплачено" в админке
if (bot) {
    bot.on('callback_query', (query) => {
        const [action, tid, sum] = query.data.split('_');
        if (action === 'pay') {
            bot.editMessageText(query.message.text + "\n\n✅ СТАТУС: ОПЛАЧЕНО", {
                chat_id: query.message.chat.id, message_id: query.message.message_id
            });
            bot.sendMessage(tid, `🌟 **ВЫПЛАТА ПОДТВЕРЖДЕНА!**\nСумма ${sum} TC отправлена на ваш кошелек!`);
        }
    });
}

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, itemId } = req.body;
    if (!userId) return res.status(400).send('No ID');

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100, energy: 50, fish: 0,
            boxes: 1, castCount: 0, durability: 100, totalEarned: 0,
            lastBonus: 0, multiplier: 1, isVip: false, isInfiniteRod: false, lastUpdate: Date.now()
        };
    }
    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) {
        let gain = u.isVip ? 1 : 0.5; 
        u.energy = Math.min(u.isVip ? 200 : 100, (u.energy || 0) + (Math.floor(timePassed / 60000) * gain));
        u.lastUpdate = now;
    }

    switch(action) {
        case 'catch_fish':
            if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑' });
            if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
            if (u.durability <= 0 && !u.isInfiniteRod) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

            u.energy -= 2; 
            if (!u.isInfiniteRod) u.durability -= 1;
            u.castCount++;

            if (Math.random() < 0.15) return res.json({ ...u, msg: 'СОРВАЛОСЬ... 🌊' });
            let weight = (Math.random() * 2.5 + 0.1);
            u.fish += weight;
            if (Math.random() < 0.03) u.boxes++;
            break;

        case 'sell_fish':
            if (u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА!' });
            let earned = Math.floor(u.fish * (2 * u.multiplier));
            u.b += earned; u.totalEarned += earned; u.fish = 0;
            break;

        case 'open_box':
            if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ!' });
            u.boxes--;
            let prize = [200, 500, 1000, 5000][Math.floor(Math.random()*4)];
            u.b += prize; u.totalEarned += prize;
            saveDB();
            return res.json({ ...u, win: prize, msg: `ВЫИГРЫШ: ${prize} TC!` });

        case 'buy_stars':
            const items = {
                'item_1': {b:5000, box:5}, 'item_2': {mult:2}, 'item_3': {b:50000, en:100},
                'item_4': {inf:true}, 'item_5': {box:10}, 'item_6': {vip:true}
            };
            let it = items[itemId];
            if(it.b) u.b += it.b;
            if(it.box) u.boxes += it.box;
            if(it.mult) u.multiplier = 2;
            if(it.inf) u.isInfiniteRod = true;
            if(it.vip) u.isVip = true;
            break;

        case 'withdraw':
            if (amount < 30000 || u.b < amount) return res.json({ ...u, msg: 'ОШИБКА!' });
            u.b -= amount;
            bot.sendMessage(ADMIN_GROUP_ID, `💳 ВЫВОД: ${u.n}\nID: ${userId}\nСумма: ${amount}\nКошелек: ${wallet}`, {
                reply_markup: { inline_keyboard: [[{text:"✅ ОПЛАЧЕНО", callback_data:`pay_${userId}_${amount}`}]] }
            });
            break;
            
        case 'repair':
            if (u.b >= 50) { u.b -= 50; u.durability = 100; }
            break;
    }

    saveDB();
    const top = Object.values(users).sort((a,b) => b.b - a.b).slice(0,10).map(x=>({n:x.n, b:x.b}));
    res.json({ ...u, level: getLevel(u.totalEarned), top });
});

app.listen(3000, () => console.log("SERVER RUNNING"));
