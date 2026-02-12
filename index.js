/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.3.0 [REF & STARS UPDATE]
 * ============================================================================
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const token = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg'; 
const ADMIN_GROUP_ID = '-5110681605'; 
const bot = new TelegramBot(token, { polling: true });
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();
app.use(cors());
app.use(express.json());

let users = {};

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (err) { users = {}; }
    }
}
const saveDB = () => { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4)); };
loadDatabase();

const getLevel = (s) => {
    if (s >= 1000000) return "ВЛАДЫКА ОКЕАНА 🔱";
    if (s >= 250000) return "ЛЕГЕНДАРНЫЙ КАПИТАН ⚓";
    if (s >= 50000) return "КАПИТАН 👨‍✈️";
    if (s >= 10000) return "МАТРОС 🚢";
    return "САЛАГА 🌱";
};

const notifyAdmin = (text) => {
    bot.sendMessage(ADMIN_GROUP_ID, `📊 **ОТЧЕТ:**\n${text}`, { parse_mode: 'Markdown' });
};

// --- ОБРАБОТКА СТАРТА БОТА (РЕФЕРАЛЫ) ---
bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1]; // ID того, кто пригласил

    if (!users[chatId] && users[referrerId] && referrerId != chatId) {
        users[referrerId].boxes = (users[referrerId].boxes || 0) + 1;
        saveDB();
        bot.sendMessage(referrerId, `💎 У вас новый реферал! Вы получили **+1 Ящик**!`, {parse_mode: 'Markdown'});
        notifyAdmin(`🤝 Реферальная связь: ${referrerId} пригласил ${chatId}`);
    }
});

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, captchaPassed, itemId } = req.body;
    if (!userId) return res.status(400).json({ error: 'No ID' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100.0, energy: 50.0, fish: 0.0,
            boxes: 0, // ТЕПЕРЬ 0 ПРИ СТАРТЕ
            castCount: 0, durability: 100, totalEarned: 0,
            lastBonus: 0, isBanned: false, lastUpdate: Date.now(),
            multiplier: 1 // Для Олигарха
        };
        saveDB();
    }

    const u = users[userId];
    const now = Date.now();
    if (u.isBanned) return res.json({ msg: "БАН 🚫" });

    // Реген энергии
    const timePassed = now - (u.lastUpdate || now);
    if (timePassed > 60000) {
        u.energy = Math.min(100, (u.energy || 0) + (Math.floor(timePassed / 60000) * 0.5));
        u.lastUpdate = now;
        saveDB();
    }

    if (action === 'catch_fish') {
        if ((u.castCount + 1) % 5 === 0 && !captchaPassed) return res.json({ ...u, msg: 'МЕШОЧЕК! 🛑' });
        if (u.energy < 2 || u.durability <= 0) return res.json({ ...u, msg: 'РЕСУРСЫ НА НУЛЕ! 🛠️' });

        u.energy -= 2; u.durability -= 1; u.castCount++;

        if (Math.random() < 0.15) { saveDB(); return res.json({ ...u, msg: 'ПУСТО... 🌊' }); }

        let weight = (Math.random() * 2.5 + 0.3);
        u.fish += weight;
        
        // ШАНС ЯЩИКА ТЕПЕРЬ 1%
        let foundBox = false;
        if (Math.random() < 0.01) { u.boxes++; foundBox = true; }

        saveDB();
        return res.json({ ...u, msg: foundBox ? `УЛОВ ${weight.toFixed(2)} КГ + 📦!` : `УЛОВ ${weight.toFixed(2)} КГ! 🎣` });
    }

    if (action === 'sell_fish') {
        if (u.fish <= 0) return res.json({ ...u, msg: 'ПУСТО! 🎒' });
        let earned = Math.floor(u.fish * (2 * (u.multiplier || 1))); // Курс 2 + множитель
        u.b += earned; u.totalEarned += earned; u.fish = 0;
        saveDB();
        return res.json({ ...u, msg: `ПРОДАНО НА ${earned} TC! 💰` });
    }

    // --- МАГАЗИН STARS ---
    if (action === 'buy_stars') {
        const catalog = {
            'starter': { title: 'Стартовый пакет', price: 50, payload: 'pack_5000' },
            'titan': { title: 'Титановая катушка', price: 150, payload: 'item_titan' },
            'oligarch': { title: 'Лицензия Олигарх', price: 500, payload: 'buff_x2' }
        };
        const item = catalog[itemId];
        
        // Создаем счет в Telegram
        try {
            const invoice = await bot.createInvoiceLink(
                item.title, 'Улучшение вашего рыбака', item.payload, '', 'XTR', 
                [{ label: 'Цена', amount: item.price }]
            );
            return res.json({ ...u, invoiceLink: invoice });
        } catch (e) {
            return res.json({ ...u, msg: 'Ошибка платежа ❌' });
        }
    }

    if (action === 'buy_tc') {
        const prices = { 'myakish': 150, 'snasti': 300, 'energy_drink': 450, 'nets': 1000 };
        if (u.b < prices[itemId]) return res.json({ ...u, msg: 'МАЛО TC! ❌' });
        u.b -= prices[itemId];
        if (itemId === 'energy_drink') u.energy = Math.min(100, u.energy + 40);
        if (itemId === 'snasti') u.durability = Math.min(100, u.durability + 50);
        saveDB();
        notifyAdmin(`👤 ${u.n} купил ${itemId}`);
        return res.json({ ...u, msg: 'КУПЛЕНО! ✅' });
    }

    if (action === 'open_box') {
        if (u.boxes <= 0) return res.json({ ...u, msg: 'НЕТ ЯЩИКОВ! 📦' });
        u.boxes--;
        const prize = Math.floor(Math.random() * 450) + 50;
        u.b += prize; u.totalEarned += prize;
        saveDB();
        return res.json({ ...u, prize, msg: `ПРИЗ: ${prize} TC! ✨` });
    }

    const top = Object.values(users).sort((a,b)=>b.b-a.b).slice(0,10).map(p=>({n:p.n,b:p.b}));
    res.json({ ...u, level: getLevel(u.totalEarned), top });
});

// ПРИЕМ ПЛАТЕЖЕЙ STARS
bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));
bot.on('successful_payment', (msg) => {
    const uid = msg.from.id;
    const payload = msg.successful_payment.invoice_payload;
    if (payload === 'pack_5000') { users[uid].b += 5000; users[uid].boxes += 5; }
    if (payload === 'buff_x2') { users[uid].multiplier = 2; }
    saveDB();
    notifyAdmin(`⭐️ ОПЛАТА STARS: ${uid} купил ${payload}`);
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('🚀 4.3.0 READY'));
