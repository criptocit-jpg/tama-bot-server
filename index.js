/**
 * ============================================================================
 * 🎣 TAMACOIN FISHING PROJECT - CORE v4.1.2 [GOLDEN MONOLITH]
 * ============================================================================
 * * ОПИСАНИЕ:
 * Центральный сервер управления игровыми механиками Tamacoin.
 * Обрабатывает запросы от Telegram WebApp, управляет базой данных пользователей,
 * начисляет бонусы, обрабатывает покупки в магазине и вывод средств.
 * * ТЕХНИЧЕСКИЙ СТЕК:
 * - Node.js
 * - Express.js
 * - Node-telegram-bot-Api
 * - FileSystem (DB)
 */

// ----------------------------------------------------------------------------
// [1] ПОДКЛЮЧЕНИЕ МОДУЛЕЙ
// ----------------------------------------------------------------------------

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'users.json');

// --- БАЗА ДАННЫХ ---
let users = {};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            users = JSON.parse(data);
            console.log("База данных загружена. Игроков:", Object.keys(users).length);
        }
    } catch (e) {
        console.error("Ошибка загрузки базы:", e);
        users = {};
    }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error("Ошибка сохранения базы:", e);
    }
}

loadData();

// --- ЛОГИКА УРОВНЕЙ ---
function getLevel(exp) {
    if (exp >= 100000) return "МОРСКОЙ ДЬЯВОЛ 🔱";
    if (exp >= 50000) return "КАПИТАН ⚓";
    if (exp >= 10000) return "МОРЯК 🌊";
    if (exp >= 1000) return "РЫБОЛОВ 🎣";
    return "САЛАГА 🌱";
}

// --- API ---

// Главный роут для проверки сервера
app.get('/', (req, res) => {
    res.send('Tamacoin Fishing Server is Running!');
});

app.post('/api/action', async (req, res) => {
    try {
        const { 
            userId, 
            userName, 
            action, 
            captchaPassed, 
            wallet, 
            amount, 
            itemId,
            refId 
        } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is missing' });
        }

        const now = Date.now();

        // Регистрация нового игрока
        if (!users[userId]) {
            users[userId] = {
                id: userId,
                n: userName || "Рыбак",
                b: 100,      // Баланс TC
                s: 0,        // Баланс Stars
                energy: 100,
                maxEnergy: 100,
                durability: 100,
                fish: 0,
                boxes: 0,
                lastBonus: 0,
                totalEarned: 0,
                castCount: 0,
                isBanned: false,
                refBy: (refId && refId !== userId) ? refId : null,
                lastUpdate: now
            };
            saveData();
        }

        const u = users[userId];

        // Восстановление энергии (1 единица в 5 минут / 300000 мс)
        const timePassed = now - (u.lastUpdate || now);
        const energyToRestore = Math.floor(timePassed / 300000);
        if (energyToRestore > 0) {
            u.energy = Math.min(u.maxEnergy, u.energy + energyToRestore);
            u.lastUpdate = now;
        }

        // БЛОК LOAD_DATA (ОБНОВЛЕНИЕ БЕЗ ЛОГИКИ)
        if (action === 'load_data') {
            const topPlayers = Object.values(users)
                .filter(p => !p.isBanned)
                .sort((a, b) => b.b - a.b)
                .slice(0, 10)
                .map(p => ({ n: p.n, b: Math.floor(p.b) }));

            return res.json({
                ...u,
                level: getLevel(u.totalEarned),
                top: topPlayers
            });
        }

        if (u.isBanned) {
            return res.json({ msg: "ДОСТУП ОГРАНИЧЕН 🚫", b: u.b });
        }

        // --- ЛОГИКА ДЕЙСТВИЙ ---

        // 1. Рыбалка
        if (action === 'catch_fish') {
            if (u.energy < 2) return res.json({ ...u, msg: "МАЛО ЭНЕРГИИ! ⚡" });
            if (u.durability <= 0) return res.json({ ...u, msg: "УДОЧКА СЛОМАНА! 🛠️" });

            u.energy -= 2;
            u.durability -= 1;
            u.castCount += 1;

            let chance = Math.random();
            let catchWeight = 0;
            let message = "";

            // Проверка Золотого Часа (19:00 - 20:00)
            const hour = new Date().getHours();
            const isGoldenHour = (hour === 19);

            if (captchaPassed) {
                // Если поймал мешок/капчу
                catchWeight = isGoldenHour ? (Math.random() * 20 + 10) : (Math.random() * 10 + 5);
                u.fish += catchWeight;
                u.boxes += 1;
                message = `ОГО! ВЫТАЩИЛ МЕШОК! +${catchWeight.toFixed(2)} кг и ЯЩИК! 📦`;
            } else {
                if (chance > 0.3) {
                    catchWeight = isGoldenHour ? (Math.random() * 5 + 2) : (Math.random() * 3 + 0.5);
                    u.fish += catchWeight;
                    message = `Поймал рыбку: ${catchWeight.toFixed(2)} кг 🐟`;
                } else {
                    message = "Сорвалось... 🌊";
                }
            }

            saveData();
            return res.json({ ...u, msg: message, level: getLevel(u.totalEarned) });
        }

        // 2. Продажа рыбы
        if (action === 'sell_fish') {
            if (u.fish <= 0) return res.json({ ...u, msg: "СУМКА ПУСТА! 🎒" });
            
            const reward = Math.floor(u.fish * 2);
            u.b += reward;
            u.totalEarned += reward;
            u.fish = 0;

            // Реферальные 10%
            if (u.refBy && users[u.refBy]) {
                const refBonus = Math.floor(reward * 0.1);
                users[u.refBy].b += refBonus;
            }

            saveData();
            return res.json({ ...u, msg: `ПРОДАНО! +${reward} TC 💰`, level: getLevel(u.totalEarned) });
        }

        // 3. Ежедневный бонус
        if (action === 'get_daily') {
            if (now - u.lastBonus < 86400000) {
                return res.json({ ...u, msg: "ЖДИ 24 ЧАСА! ⏳" });
            }
            const bonus = 50 + Math.floor(Math.random() * 100);
            u.b += bonus;
            u.energy = u.maxEnergy;
            u.lastBonus = now;
            saveData();
            return res.json({ ...u, msg: `БОНУС: +${bonus} TC и МАКС. ЭНЕРГИЯ! 🎁` });
        }

        // 4. Ремонт
        if (action === 'repair') {
            if (u.b < 50) return res.json({ ...u, msg: "НУЖНО 50 TC! 💸" });
            u.b -= 50;
            u.durability = 100;
            saveData();
            return res.json({ ...u, msg: "УДОЧКА КАК НОВАЯ! 🛠️" });
        }

        // 5. Покупка предметов
        if (action === 'buy_item') {
            if (itemId === 'energy_drink') {
                if (u.b < 100) return res.json({ ...u, msg: "МАЛО TC!" });
                u.b -= 100;
                u.energy = Math.min(u.maxEnergy, u.energy + 30);
                message = "ВЫПИЛ ЭНЕРГЕТИК! +30 ⚡";
            } else if (itemId === 'safe_ball') {
                if (u.b < 50) return res.json({ ...u, msg: "МАЛО TC!" });
                u.b -= 50;
                message = "МЯЧИК КУПЛЕН! (Эффект будет в v5.0)";
            } else if (itemId === 'golden_lake') {
                if (u.s < 150) return res.json({ ...u, msg: "МАЛО STARS! ⭐" });
                u.s -= 150;
                message = "ДОСТУП К ОЗЕРУ ОТКРЫТ! 🏆";
            }
            saveData();
            return res.json({ ...u, msg: message });
        }

        // 6. Открытие ящика
        if (action === 'open_box') {
            if (u.boxes <= 0) return res.json({ ...u, msg: "НЕТ ЯЩИКОВ! 📦" });
            u.boxes -= 1;
            const prize = Math.random();
            let prizeMsg = "";
            if (prize > 0.95) {
                u.s += 10;
                prizeMsg = "ЛЕГЕНДАРНО! +10 STARS! ⭐";
            } else if (prize > 0.7) {
                const tc = 200 + Math.floor(Math.random() * 300);
                u.b += tc;
                prizeMsg = `УДАЧА! +${tc} TC! 💰`;
            } else {
                u.energy = Math.min(u.maxEnergy, u.energy + 20);
                prizeMsg = "В ящике был энергетик! +20 ⚡";
            }
            saveData();
            return res.json({ ...u, msg: prizeMsg });
        }

        // 7. Вывод
        if (action === 'withdraw') {
            if (amount < 30000) return res.json({ ...u, msg: "МИНИМУМ 30,000 TC!" });
            if (u.b < amount) return res.json({ ...u, msg: "НЕДОСТАТОЧНО СРЕДСТВ!" });
            
            u.b -= amount;
            console.log(`ЗАЯВКА НА ВЫВОД: User ${userId}, Wallet ${wallet}, Amount ${amount}`);
            saveData();
            return res.json({ ...u, msg: "ЗАЯВКА ОТПРАВЛЕНА АДМИНУ! 🚀" });
        }

        // По умолчанию просто возвращаем статус
        return res.json({
            ...u,
            level: getLevel(u.totalEarned)
        });

    } catch (e) {
        console.error("Критическая ошибка API:", e);
        res.status(500).json({ error: "Ошибка на стороне сервера" });
    }
});

// Запуск
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
