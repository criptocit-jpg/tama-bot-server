/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.2.0 [MONETIZATION & ADMIN NOTIFY]
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

// Хелпер для уведомления админа
const notifyAdmin = (text) => {
    bot.sendMessage(ADMIN_GROUP_ID, `🛍️ **НОВАЯ ПОКУПКА**\n${text}`, { parse_mode: 'Markdown' });
};

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, itemId } = req.body;
    if (!userId) return res.status(400).json({ error: 'No ID' });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || 'Рыбак', b: 100.0, energy: 50.0, fish: 0.0,
            boxes: 1, durability: 100, totalEarned: 0, 
            premium: false, multiplier: 2, lastUpdate: Date.now()
        };
        saveDB();
    }
    const u = users[userId];

    // --- МАГАЗИН ЗА TC ---
    if (action === 'buy_tc') {
        const storeTC = {
            'myakish': { name: 'Мякиш', price: 150, desc: '+5 забросов без промаха' },
            'snasti': { name: 'Комплект снастей', price: 300, desc: 'Защита прочности' },
            'energy_drink': { name: 'Энергетик', price: 450, desc: '+40 энергии' },
            'nets': { name: 'Сети', price: 1000, desc: 'Разовый крупный улов' }
        };

        const item = storeTC[itemId];
        if (!item) return res.json({ ...u, msg: 'Товар не найден' });
        if (u.b < item.price) return res.json({ ...u, msg: 'Недостаточно TC!' });

        u.b -= item.price;
        // Здесь логика применения эффекта (упрощенно)
        if (itemId === 'energy_drink') u.energy = Math.min(100, u.energy + 40);
        
        saveDB();
        notifyAdmin(`👤 ${u.n} (ID: ${userId})\n📦 Товар: ${item.name}\n💰 Цена: ${item.price} TC`);
        return res.json({ ...u, msg: `Куплено: ${item.name}! ✅` });
    }

    // --- МАГАЗИН ЗА STARS (Инициация счета) ---
    if (action === 'buy_stars') {
        const storeStars = {
            'starter': { name: 'Стартовый капитал', stars: 50 },
            'titan': { name: 'Титановая катушка', stars: 150 },
            'thermos': { name: 'Бесконечный термос', stars: 250 },
            'oligarch': { name: 'Лицензия Олигарх', stars: 500 }
        };
        
        const item = storeStars[itemId];
        // В реальном API здесь создается ссылка на оплату через bot.createInvoiceLink
        return res.json({ ...u, msg: `Переходим к оплате ${item.stars} Stars... ⭐️` });
    }

    res.json(u);
});

// Обработка успешных платежей Stars
bot.on('pre_checkout_query', (query) => bot.answerPreCheckoutQuery(query.id, true));
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const payload = msg.successful_payment.invoice_payload;
    // Начисление бонуса и уведомление
    notifyAdmin(`⭐️ **STARS ПОКУПКА**\n👤 ID: ${userId}\n💎 Пакет: ${payload}\n💵 Сумма: ${msg.successful_payment.total_amount / 100} Stars`);
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`🚀 v4.2.0 ACTIVE`));
