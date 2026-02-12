/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.1.3 [GOLDEN MONOLITH RESTORED]
 * ============================================================================
 * * ОПИСАНИЕ:
 * Центральный сервер управления игровыми механиками Tamacoin.
 * Исправлены: расчет продажи рыбы и отображение приза из ящика.
 */

// ----------------------------------------------------------------------------
// [1] ПОДКЛЮЧЕНИЕ МОДУЛЕЙ
// ----------------------------------------------------------------------------

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// ----------------------------------------------------------------------------
// [2] НАСТРОЙКИ КОНФИГУРАЦИИ
// ----------------------------------------------------------------------------

const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 

const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

// ----------------------------------------------------------------------------
// [3] ИНИЦИАЛИЗАЦИЯ ТЕЛЕГРАМ-БОТА
// ----------------------------------------------------------------------------

let bot;

try {
    bot = new TelegramBot(token, { polling: true });
    
    console.log("=========================================================");
    console.log("📡 СИСТЕМА: Ядро v4.1.3 успешно запущено.");
    console.log("🛰️ СТАТУС: Бот активен, данные восстановлены.");
    console.log("=========================================================");
} catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА БОТА:", error.message);
}

// ----------------------------------------------------------------------------
// [4] РАБОТА С БАЗОЙ ДАННЫХ
// ----------------------------------------------------------------------------

let users = {};

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            users = JSON.parse(data);
        } catch (err) {
            users = {};
        }
    } else {
        users = {};
    }
}

const saveDB = () => {
    try {
        const data = JSON.stringify(users, null, 4);
        fs.writeFileSync(DB_FILE, data);
    } catch (err) {
        console.error("❌ Ошибка при записи:", err.message);
    }
};

loadDatabase();

// ----------------------------------------------------------------------------
// [5] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ----------------------------------------------------------------------------

const getLevel = (totalEarned) => {
    const score = totalEarned || 0;
    if (score >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (score >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (score >= 50000) return "КАПИТАН 👨‍✈️";
    if (score >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

// ----------------------------------------------------------------------------
// [6] ОБРАБОТКА ТЕЛЕГРАМ СОБЫТИЙ (АДМИН-ПАНЕЛЬ)
// ----------------------------------------------------------------------------

if (bot) {
    bot.on('callback_query', (query) => {
        const data = query.data.split('_');
        const action = data[0]; 
        const targetId = data[1]; 
        const amount = data[2]; 

        if (action === 'pay') {
            bot.editMessageText(`✅ **ВЫПЛАТА ЗАВЕРШЕНА**\n💰 Сумма: ${amount} TC\n👤 Игрок: ${targetId}`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            bot.sendMessage(targetId, `🌟 **ВЫПЛАТА ПОДТВЕРЖДЕНА!**\n\nСумма ${amount} TC отправлена!`);
        }
    });

    bot.on('message', (msg) => {
        const chatId = msg.chat.id.toString();
        if (chatId !== ADMIN_GROUP_ID) return;

        if (msg.text && msg.text.startsWith('give')) {
            const parts = msg.text.split(' ');
            const tid = parts[1];
            const amt = parts[2];
            if (users[tid]) {
                const numAmt = parseFloat(amt);
                users[tid].b += numAmt;
                users[tid].totalEarned += numAmt;
                saveDB();
                bot.sendMessage(chatId, `💰 Начислено ${numAmt} TC игроку ${users[tid].n}`);
            }
        }
    });
}

// ----------------------------------------------------------------------------
// [7] ГЛАВНЫЙ API ОБРАБОТЧИК (CORE LOGIC)
// ----------------------------------------------------------------------------

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, wallet, amount, itemId } = req.body;

    if (!userId) return res.status(400).json({ error: 'No ID' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100.0, energy: 50.0, fish: 0.0,
            boxes: 1, castCount: 0, durability: 100, totalEarned: 0,
            lastBonus: 0, isBanned: false, lastUpdate: Date.now()
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();

    if (u.isBanned) return res.json({ msg: "АККАУНТ ЗАБЛОКИРОВАН! 🚫" });

    // РЕГЕНЕРАЦИЯ
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) { 
        const recovered = Math.floor(timePassed / 60000) * 0.5;
        u.energy = Math.min(100, (u.energy || 0) + recovered);
        u.lastUpdate = now;
    }

    // CATCH FISH
    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑' });
        if (u.energy < 2) return res.json({ ...u, msg: 'НЕТ ЭНЕРГИИ! ⚡' });
        if (u.durability <= 0) return res.json({ ...u, msg: 'УДОЧКА СЛОМАНА! 🛠️' });

        u.energy -= 2;
        u.durability -= 1;
        u.castCount++;

        if (Math.random() < 0.2) {
            saveDB();
            return res.json({ ...u, msg: 'ПУСТО... 🌊' });
        }

        let weight = (Math.random() * 2.5 + 0.2);
        u.fish += weight;
        let foundBox = false;
        if (Math.random() < 0.03) { u.boxes++; foundBox = true; }

        saveDB();
        return res.json({ ...u, msg: foundBox ? `ПОЙМАЛ: ${weight.toFixed(2)} КГ! +📦 ЯЩИК!` : `ПОЙМАЛ: ${weight.toFixed(2)} КГ! 🎣` });
    }

    // SELL FISH (ИСПРАВЛЕНО: Теперьearned рассчитывается корректно)
    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: 'СУМКА ПУСТА! 🎒' });
        let earned = Math.floor(u.fish * 15); // Курс 15 TC за кг (согласно пожеланиям из v4.2)
        u.b += earned;
        u.totalEarned += earned;
        u.fish = 0;
        saveDB();
        return res.json({ ...u, msg: `ПРОДАНО НА ${earned} TC! 💰` });
    }

    // GET DAILY
    if (action === 'get_daily') {
        const dayInMs = 24 * 60 * 60 * 1000;
        if (now - (u.lastBonus || 0) < dayInMs) return res.json({ ...u, msg: `ЖДИ! ⏳` });
        u.b += 100; u.lastBonus = now;
        saveDB();
        return res.json({ ...u, msg: 'БОНУС 100 TC ПОЛУЧЕН! 🎁' });
    }

    // SHOP
    if (action === 'buy_item') {
        if (itemId === 'energy') {
            if (u.b < 500) return res.json({ ...u, msg: 'НЕ ХВАТАЕТ TC! ❌' });
            u.b -= 500; u.energy = Math.min(100, (u.energy || 0) + 30);
            saveDB();
            return res.json({ ...u, msg: 'КУПЛЕНО: +30 ЭНЕРГИИ! ⚡' });
        }
    }

    // REPAIR
    if (action === 'repair') {
        if (u.b < 50) return res.json({ ...u, msg: 'МАЛО TC! ❌' });
        u.b -= 50; u.durability = 100;
        saveDB();
        return res.json({ ...u, msg: 'УДОЧКА КАК НОВАЯ! 🛠️' });
    }

    // OPEN BOX (ИСПРАВЛЕНО: Возвращаем prize для UI)
    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ! 📦' });
        u.boxes--;
        const prize = Math.floor(Math.random() * 450) + 50;
        u.b += prize; u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, prize: prize, msg: `В ЯЩИКЕ БЫЛО ${prize} TC! ✨` });
    }

    // WITHDRAW
    if (action === 'withdraw') {
        const val = parseFloat(amount);
        if (isNaN(val) || val < 30000 || u.b < val) return res.json({ ...u, msg: 'ОШИБКА ВЫВОДА! ❌' });
        u.b -= val;
        saveDB();
        if (bot) {
            bot.sendMessage(ADMIN_GROUP_ID, `💳 ВЫВОД: ${u.n}\n💰 Сумма: ${val} TC\n🏦 Кошелек: ${wallet}`, {
                reply_markup: { inline_keyboard: [[{ text: "✅ ОПЛАТИТЬ", callback_data: `pay_${userId}_${val}` }]] }
            });
        }
        return res.json({ ...u, msg: 'ЗАЯВКА ОТПРАВЛЕНА! ✅' });
    }

    const topPlayers = Object.values(users).sort((a, b) => b.b - a.b).slice(0, 10).map(p => ({ n: p.n, b: p.b }));
    res.json({ ...u, level: getLevel(u.totalEarned), top: topPlayers });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 СЕРВЕР v4.1.3 PORT ${PORT}`));
