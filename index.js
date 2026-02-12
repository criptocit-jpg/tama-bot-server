/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING - SERVER v4.2.3 [GOLDEN BASE REPAIR]
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const DB_FILE = path.join(__dirname, 'database.json');

let users = {};

const app = express();
app.use(cors());
app.use(express.json());

let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("🚀 СЕРВЕР v4.2.3 ЗАПУЩЕН");
} catch (e) { console.error("Ошибка бота:", e.message); }

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { users = {}; }
    }
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
loadDB();

const getLevel = (exp) => {
    const s = exp || 0;
    if (s >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (s >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (s >= 50000) return "КАПИТАН 👨‍✈️";
    if (s >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// API
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, itemId, amount, wallet, captchaPassed } = req.body;
    if (!userId) return res.status(400).send("No ID");

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100.0, energy: 50.0, fish: 0.0,
            boxes: 1, castCount: 0, durability: 100, totalEarned: 0,
            lastBonus: 0, lastUpdate: Date.now(), location: 'lake',
            inventory: { oil: 0, bread: 0, contract: false }
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();

    // Регенерация энергии
    const diff = now - (u.lastUpdate || now);
    if (diff > 60000) {
        let rate = u.inventory.contract ? 0.8 : 0.5;
        u.energy = Math.min(100, (u.energy || 0) + (Math.floor(diff/60000) * rate));
        u.lastUpdate = now;
    }

    // РЫБАЛКА
    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({...u, msg: 'МЕШОЧЕК! 🛑', level: getLevel(u.totalEarned)});
        if (u.energy < 2 || u.durability <= 0) return res.json({...u, msg: 'НЕТ ЭНЕРГИИ ИЛИ УДОЧКА СЛОМАНА!', level: getLevel(u.totalEarned)});

        u.energy -= 2;
        u.durability -= (u.inventory.oil > 0 ? 0.5 : 1);
        if (u.inventory.oil > 0) u.inventory.oil--;
        u.castCount++;

        let w = 0; let m = "";
        if (u.location === 'sea') {
            if (Math.random() < 0.005) { u.b += 5000; u.totalEarned += 5000; m = "🏆 ЛЕГЕНДА: ЗОЛОТОЙ КАРП (+5000 TC)!"; }
            else { w = Math.random()*8+1.5; u.fish += w; m = `🌊 МОРЕ: +${w.toFixed(2)} кг`; }
        } else {
            if (Math.random() < 0.2 && u.inventory.bread <= 0) m = "🌊 ПУСТО...";
            else { w = Math.random()*2.5+0.2; u.fish += w; if(u.inventory.bread > 0) u.inventory.bread--; m = `🎣 УЛОВ: +${w.toFixed(2)} кг`; }
        }
        if (Math.random() < 0.03) { u.boxes++; m += " +📦 ЯЩИК!"; }
        saveDB();
        return res.json({...u, msg: m, level: getLevel(u.totalEarned)});
    }

    // ПРОДАЖА (ИСПРАВЛЕНО: Теперь начисляет корректно)
    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({...u, msg: "СУМКА ПУСТА!"});
        let earned = Math.floor(u.fish * 10); // Цена за кг
        if (u.inventory.contract) earned = Math.floor(earned * 1.2);
        
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        saveDB();
        return res.json({...u, msg: `💰 ПРОДАНО НА ${earned} TC!`, level: getLevel(u.totalEarned)});
    }

    // ЯЩИКИ (ИСПРАВЛЕНО: prize передается явно)
    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({...u, msg: "НЕТ ЯЩИКОВ!"});
        u.boxes--;
        const prize = Math.floor(Math.random()*450)+50;
        u.b += prize;
        u.totalEarned += prize;
        saveDB();
        return res.json({...u, prize: prize, msg: `📦 В ЯЩИКЕ БЫЛО ${prize} TC`, level: getLevel(u.totalEarned)});
    }

    // МАГАЗИН И РЕМОНТ
    if (action === 'buy_tc') {
        const prices = { bread: 50, oil: 150, meal: 800 };
        if (u.b < prices[itemId]) return res.json({...u, msg: "НЕДОСТАТОЧНО TC!"});
        u.b -= prices[itemId];
        if (itemId === 'bread') u.inventory.bread += 5;
        if (itemId === 'oil') u.inventory.oil += 10;
        if (itemId === 'meal') u.energy = 100;
        saveDB();
        return res.json({...u, msg: "✅ ТОВАР ПОЛУЧЕН!", level: getLevel(u.totalEarned)});
    }

    if (action === 'repair') {
        if (u.b < 50) return res.json({...u, msg: "НУЖНО 50 TC!"});
        u.b -= 50; u.durability = 100;
        saveDB();
        return res.json({...u, msg: "🛠️ УДОЧКА КАК НОВАЯ!", level: getLevel(u.totalEarned)});
    }

    if (action === 'get_daily') {
        const day = 24 * 60 * 60 * 1000;
        if (now - (u.lastBonus || 0) < day) return res.json({...u, msg: "🎁 БОНУС ЕЩЕ НЕ ГОТОВ!"});
        u.b += 100; u.lastBonus = now;
        saveDB();
        return res.json({...u, msg: "🎁 ПОЛУЧЕНО 100 TC!", level: getLevel(u.totalEarned)});
    }

    res.json({...u, level: getLevel(u.totalEarned)});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 СЕРВЕР LIVE` + PORT));
