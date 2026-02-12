/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.3.0 [ULTIMATE MONOLITH]
 * ============================================================================
 * Слияние версий 4.1.2 и 4.3.0. Полный функционал.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- [КОНФИГУРАЦИЯ] ---
const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

let bot;
try {
    bot = new TelegramBot(token, { polling: true });
    console.log("=========================================================");
    console.log("📡 СИСТЕМА: Ядро v4.3.0 (FULL) запущено.");
    console.log("=========================================================");
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА БОТА:", error.message);
}

let users = {};

// --- [РАБОТА С БАЗОЙ] ---
function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            console.log(`✅ База загружена. Игроков: ${Object.keys(users).length}`);
        } catch (err) { users = {}; }
    }
}
const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
    } catch (e) { console.error("Ошибка сохранения:", e.message); }
};
loadDatabase();

// --- [ЛОГИКА РАНГОВ] ---
const getLevel = (totalEarned) => {
    const score = totalEarned || 0;
    if (score >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (score >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (score >= 50000) return "КАПИТАН 👨‍✈️";
    if (score >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// --- [ТЕЛЕГРАМ СОБЫТИЯ] ---
if (bot) {
    bot.on('callback_query', (query) => {
        const [action, targetId, amount] = query.data.split('_');
        if (action === 'pay') {
            bot.editMessageText(`✅ ВЫПЛАТА ${amount} TC ЗАВЕРШЕНА для ${targetId}`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            bot.sendMessage(targetId, `🌟 **ВЫПЛАТА ПОДТВЕРЖДЕНА!** Сумма: ${amount} TC.`);
        }
    });

    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        if (chatId !== ADMIN_GROUP_ID) return;
        if (msg.text && msg.text.startsWith('give')) {
            const [, tid, amt] = msg.text.split(' ');
            if (users[tid]) {
                const nAmt = parseFloat(amt);
                users[tid].b += nAmt;
                users[tid].totalEarned += nAmt;
                saveDB();
                bot.sendMessage(chatId, `💰 Начислено ${nAmt} TC игроку ${users[tid].n}`);
            }
        }
    });
}

// --- [ГЛАВНЫЙ API ОБРАБОТЧИК] ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, itemId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is missing' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак',
            b: 100.0, energy: 50.0, fish: 0.0, boxes: 1,
            castCount: 0, durability: 100, totalEarned: 0,
            lastBonus: 0, isBanned: false, multiplier: 1, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();
    if (u.isBanned) return res.json({ msg: "АККАУНТ ЗАБЛОКИРОВАН! 🚫" });

    // Регенерация энергии
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) {
        u.energy = Math.min(100, (u.energy || 0) + (Math.floor(timePassed / 60000) * 0.5));
        u.lastUpdate = now;
    }

    // --- ОБРАБОТКА ДЕЙСТВИЙ ---
    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑' });
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        u.energy -= 2; u.durability -= 1; u.castCount++;
        if (Math.random() < 0.2) { saveDB(); return res.json({ ...u, msg: 'ПУСТО... 🌊' }); }

        let weight = (Math.random() * 2.5 + 0.2);
        u.fish += weight;
        let msg = `ПОЙМАЛ: ${weight.toFixed(2)} КГ! 🎣`;
        if (Math.random() < 0.03) { u.boxes++; msg += " +📦 ЯЩИК!"; }
        saveDB();
        return res.json({ ...u, msg });
    }

    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА! 🎒' });
        let price = 2 * (u.multiplier || 1); // По умолчанию 2 TC из v4.3.0
        let earned = Math.floor(u.fish * price);
        u.b += earned; u.totalEarned += earned; u.fish = 0;
        saveDB();
        return res.json({ ...u, msg: `ПРОДАНО НА ${earned} TC! 💰` });
    }

    if (action === 'get_daily') {
        if (now - u.lastBonus < 86400000) return res.json({ ...u, msg: 'ЖДИ 24 ЧАСА! ⏳' });
        u.b += 100; u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'БОНУС 100 TC ПОЛУЧЕН! 🎁' });
    }

    if (action === 'buy_tc') {
        const shop = { 'myakish': 150, 'snasti': 300, 'energy_drink': 450, 'nets': 1000, 'energy': 500 };
        if (u.b < shop[itemId]) return res.json({ ...u, msg: 'МАЛО TC! ❌' });
        u.b -= shop[itemId];
        if (itemId === 'myakish') u.castCount = 0;
        if (itemId === 'snasti') u.durability = Math.min(100, u.durability + 50);
        if (itemId === 'energy_drink' || itemId === 'energy') u.energy = Math.min(100, u.energy + 40);
        if (itemId === 'nets') {
            let nCatch = Math.floor(Math.random() * 10) + 5;
            u.fish += nCatch;
            saveDB();
            return res.json({ ...u, msg: `СЕТИ ПРИНЕСЛИ ${nCatch} КГ! 🕸️` });
        }
        saveDB();
        return res.json({ ...u, msg: 'КУПЛЕНО! ✅' });
    }

    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'МАЛО TC! ❌' });
        u.b -= 50; u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'ПОЧИНЕНО! 🛠️' });
    }

    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ! 📦' });
        u.boxes--;
        let p = Math.floor(Math.random() * 450) + 50;
        u.b += p; u.totalEarned += p;
        saveDB();
        return res.json({ ...u, msg: `В ЯЩИКЕ: ${p} TC! ✨` });
    }

    if (action === 'withdraw') {
        let val = parseFloat(amount);
        if (val < 30000 || u.b < val) return res.json({ ...u, msg: 'ОШИБКА ВЫВОДА! ❌' });
        u.b -= val;
        saveDB();
        if (bot) bot.sendMessage(ADMIN_GROUP_ID, `💳 ВЫВОД: ${u.n} (ID: ${userId})\nСумма: ${val} TC\nКошелек: ${wallet}`);
        return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА! ✅' });
    }

    // Default: load_data
    const top = Object.values(users).sort((a,b) => b.b - a.b).slice(0, 10).map(p => ({n: p.n, b: p.b}));
    res.json({ ...u, level: getLevel(u.totalEarned), top });
});

app.listen(3000, '0.0.0.0', () => console.log("🚀 SERVER v4.3.0 FULL START"));
