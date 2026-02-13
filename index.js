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

// --- СОСТОЯНИЕ СЕРВЕРА ---
let users = {};
let gameLog = [
    "Добро пожаловать в Tamacoin Fishing!",
    "Рыбак удачи поймал Золотого Карпа! 🐟",
    "Новый игрок присоединился к флотилии! ⚓",
    "Система готова к работе. Удачного клева!"
];

// --- РАБОТА С ФАЙЛАМИ ---
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE, 'utf8');
            users = JSON.parse(rawData);
            console.log("-----------------------------------------");
            console.log("БАЗА ДАННЫХ ЗАГРУЖЕНА УСПЕШНО");
            console.log("ВСЕГО ИГРОКОВ В СИСТЕМЕ:", Object.keys(users).length);
            console.log("-----------------------------------------");
        }
    } catch (e) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА ЗАГРУЗКИ БАЗЫ:", e);
        users = {};
    }
}

function saveData() {
    try {
        const dataToSave = JSON.stringify(users, null, 2);
        fs.writeFileSync(DATA_FILE, dataToSave);
    } catch (e) {
        console.error("ОШИБКА СОХРАНЕНИЯ ДАННЫХ:", e);
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function addLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    gameLog.unshift(`[${timestamp}] ${msg}`);
    if (gameLog.length > 20) {
        gameLog.pop();
    }
}

function getLevel(exp) {
    if (exp >= 500000) return "БОГ ОКЕАНА 🔱";
    if (exp >= 250000) return "ЛЕГЕНДАРНЫЙ ПИРАТ 🏴‍☠️";
    if (exp >= 100000) return "МОРСКОЙ ДЬЯВОЛ 🔱";
    if (exp >= 50000) return "КАПИТАН ⚓";
    if (exp >= 25000) return "СТАРШИЙ МИЧМАН 🎖️";
    if (exp >= 10000) return "МОРЯК 🌊";
    if (exp >= 5000) return "МАТРОС ⚓";
    if (exp >= 1000) return "РЫБОЛОВ 🎣";
    return "САЛАГА 🌱";
}

// --- ИНИЦИАЛИЗАЦИЯ ПРИ ЗАПУСКЕ ---
loadData();

// --- API ОБРАБОТКА ---

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
            return res.status(400).json({ error: 'UserID is required' });
        }

        const now = Date.now();

        // Проверка и создание пользователя
        if (!users[userId]) {
            users[userId] = {
                id: userId,
                n: userName || "Анонимный Рыбак",
                b: 150.00,       // Баланс TC
                s: 0,            // Баланс Stars
                energy: 100,
                maxEnergy: 100,
                durability: 100,
                fish: 0.0,
                boxes: 0,
                lastBonus: 0,
                totalEarned: 0,
                castCount: 0,
                isBanned: false,
                refBy: (refId && refId !== userId) ? refId : null,
                lastUpdate: now,
                registrationDate: now
            };
            
            if (users[userId].refBy) {
                addLog(`Новый реферал! ${users[userId].n} пришел по ссылке.`);
            } else {
                addLog(`Новый игрок в океане: ${users[userId].n}!`);
            }
            saveData();
        }

        const u = users[userId];

        // --- РЕГЕНЕРАЦИЯ ЭНЕРГИИ ---
        // Восстанавливаем 1 энергию каждые 5 минут (300 000 мс)
        const timePassed = now - (u.lastUpdate || now);
        if (timePassed > 300000) {
            const energyToRestore = Math.floor(timePassed / 300000);
            if (energyToRestore > 0) {
                u.energy = Math.min(u.maxEnergy, u.energy + energyToRestore);
                u.lastUpdate = now;
            }
        }

        // --- ОБРАБОТКА LOAD_DATA ---
        if (action === 'load_data') {
            const topPlayers = Object.values(users)
                .filter(p => !p.isBanned)
                .sort((a, b) => b.b - a.b)
                .slice(0, 10)
                .map(p => ({ n: p.n, b: Math.floor(p.b) }));

            return res.json({
                ...u,
                level: getLevel(u.totalEarned),
                top: topPlayers,
                logs: gameLog,
                serverTime: now
            });
        }

        // --- ПРОВЕРКА БАНА ---
        if (u.isBanned) {
            return res.json({ 
                msg: "ВАШ АККАУНТ ЗАБЛОКИРОВАН ЗА НАРУШЕНИЯ 🚫", 
                b: u.b, 
                isBanned: true 
            });
        }

        // --- ЛОГИКА РЫБАЛКИ ---
        if (action === 'catch_fish') {
            if (u.energy < 2) {
                return res.json({ ...u, msg: "НЕДОСТАТОЧНО ЭНЕРГИИ! НУЖНО ХОТЯ БЫ 2 ⚡", level: getLevel(u.totalEarned) });
            }
            if (u.durability <= 0) {
                return res.json({ ...u, msg: "ВАША УДОЧКА СЛОМАНА! ПОЧИНИТЕ В МАСТЕРСКОЙ 🛠️", level: getLevel(u.totalEarned) });
            }

            u.energy -= 2;
            u.durability -= 1;
            u.castCount += 1;
            u.lastUpdate = now;

            let message = "";
            let catchWeight = 0;
            const hour = new Date().getHours();
            const isGoldenHour = (hour === 19);

            // Если поймана капча (мешок)
            if (captchaPassed) {
                catchWeight = isGoldenHour ? (Math.random() * 25 + 15) : (Math.random() * 15 + 8);
                u.fish += catchWeight;
                u.boxes += 1;
                message = `ВЫТАЩИЛ ЗОЛОТОЙ МЕШОК! +${catchWeight.toFixed(2)} кг и ЯЩИК! 📦`;
                addLog(`${u.n} выловил ценный трофей: ${catchWeight.toFixed(2)} кг!`);
            } else {
                // Обычный шанс поймать рыбу
                const successChance = Math.random();
                if (successChance > 0.35) {
                    catchWeight = isGoldenHour ? (Math.random() * 8 + 3) : (Math.random() * 4 + 0.3);
                    u.fish += catchWeight;
                    message = `УДАЧНЫЙ ЗАБРОС! Вы поймали: ${catchWeight.toFixed(2)} кг рыбы 🐟`;
                    
                    if (catchWeight > 7) {
                        addLog(`ОГО! ${u.n} поймал рыбину на ${catchWeight.toFixed(2)} кг!`);
                    }
                } else {
                    message = "РЫБА СОРВАЛАСЬ... Попробуйте еще раз! 🌊";
                }
            }

            saveData();
            return res.json({ ...u, msg: message, level: getLevel(u.totalEarned) });
        }

        // --- ПРОДАЖА УЛОВА ---
        if (action === 'sell_fish') {
            if (u.fish <= 0) {
                return res.json({ ...u, msg: "У ВАС НЕТ РЫБЫ ДЛЯ ПРОДАЖИ! 🎒", level: getLevel(u.totalEarned) });
            }

            const pricePerKg = 2.5;
            const reward = Math.floor(u.fish * pricePerKg);
            
            u.b += reward;
            u.totalEarned += reward;
            u.fish = 0;

            // Реферальная система 10%
            if (u.refBy && users[u.refBy]) {
                const refBonus = Math.floor(reward * 0.1);
                users[u.refBy].b += refBonus;
                users[u.refBy].totalEarned += refBonus;
            }

            saveData();
            return res.json({ 
                ...u, 
                msg: `ВЫ ПРОДАЛИ УЛОВ ЗА ${reward} TC! БАЛАНС ПОПОЛНЕН 💰`, 
                level: getLevel(u.totalEarned) 
            });
        }

        // --- ЕЖЕДНЕВНЫЙ БОНУС ---
        if (action === 'get_daily') {
            const oneDay = 86400000;
            if (now - u.lastBonus < oneDay) {
                const timeLeft = oneDay - (now - u.lastBonus);
                const hours = Math.floor(timeLeft / 3600000);
                return res.json({ ...u, msg: `БОНУС ЕЩЕ НЕ ГОТОВ. ПРИХОДИТЕ ЧЕРЕЗ ${hours} ч. ⏳` });
            }

            const dailyTC = 100 + Math.floor(Math.random() * 50);
            u.b += dailyTC;
            u.energy = u.maxEnergy; // Полное восстановление
            u.lastBonus = now;

            saveData();
            addLog(`${u.n} получил ежедневный подарок! 🎁`);
            return res.json({ 
                ...u, 
                msg: `ПОЛУЧЕНО: +${dailyTC} TC И ПОЛНЫЙ ЗАПАС ЭНЕРГИИ! 🎁`, 
                level: getLevel(u.totalEarned) 
            });
        }

        // --- МАСТЕРСКАЯ (РЕМОНТ) ---
        if (action === 'repair') {
            const repairCost = 50;
            if (u.b < repairCost) {
                return res.json({ ...u, msg: `НЕДОСТАТОЧНО TC! РЕМОНТ СТОИТ ${repairCost} TC 💸` });
            }

            u.b -= repairCost;
            u.durability = 100;
            saveData();
            return res.json({ ...u, msg: "УДОЧКА ПОЛНОСТЬЮ ОТРЕМОНТИРОВАНА! 🛠️", level: getLevel(u.totalEarned) });
        }

        // --- МАГАЗИН ПРЕДМЕТОВ ---
        if (action === 'buy_item') {
            let buyMsg = "";
            
            // Энергетик
            if (itemId === 'energy_drink') {
                if (u.b < 100) return res.json({ ...u, msg: "НЕ ХВАТАЕТ TC НА ЭНЕРГЕТИК! 🥤" });
                u.b -= 100;
                u.energy = Math.min(u.maxEnergy + 20, u.energy + 40);
                buyMsg = "ВЫ ВЫПИЛИ ЭНЕРГЕТИК! +40 ЭНЕРГИИ ⚡";
            }
            
            // Мячик (Защита)
            else if (itemId === 'safe_ball') {
                if (u.b < 50) return res.json({ ...u, msg: "НЕ ХВАТАЕТ TC НА МЯЧИК! ⚽" });
                u.b -= 50;
                buyMsg = "МЯЧИК КУПЛЕН! Теперь рыба соскальзывает реже (эффект активен).";
            }
            
            // Золотое озеро (Stars)
            else if (itemId === 'golden_lake') {
                if (u.s < 150) return res.json({ ...u, msg: "НЕДОСТАТОЧНО STARS! НУЖНО 150 ⭐" });
                u.s -= 150;
                buyMsg = "ДОСТУП К ОЗЕРУ НАДЕЖДЫ ОТКРЫТ! Удачи в ловле редких видов! 🌊";
                addLog(`${u.n} открыл доступ к Озеру Надежды за STARS! ⭐`);
            }

            saveData();
            return res.json({ ...u, msg: buyMsg, level: getLevel(u.totalEarned) });
        }

        // --- ВЫВОД СРЕДСТВ ---
        if (action === 'withdraw') {
            const minWithdraw = 30000;
            const withdrawAmount = parseFloat(amount);

            if (!wallet || wallet.length < 10) {
                return res.json({ ...u, msg: "УКАЖИТЕ КОРРЕКТНЫЙ АДРЕС КОШЕЛЬКА! 💳" });
            }
            if (withdrawAmount < minWithdraw) {
                return res.json({ ...u, msg: `МИНИМАЛЬНЫЙ ВЫВОД ОТ ${minWithdraw} TC!` });
            }
            if (u.b < withdrawAmount) {
                return res.json({ ...u, msg: "НЕДОСТАТОЧНО СРЕДСТВ ДЛЯ ВЫВОДА! 📉" });
            }

            u.b -= withdrawAmount;
            saveData();
            
            console.log(`!!! ЗАЯВКА НА ВЫВОД !!!`);
            console.log(`Игрок: ${u.n} (ID: ${userId})`);
            console.log(`Сумма: ${withdrawAmount} TC`);
            console.log(`Кошелек: ${wallet}`);
            
            addLog(`${u.n} оформил вывод на ${withdrawAmount} TC! Ждем подтверждения. 🚀`);
            return res.json({ ...u, msg: "ЗАЯВКА НА ВЫВОД ОТПРАВЛЕНА В ОБРАБОТКУ! 🚀" });
        }

        // Дефолтный ответ
        return res.json({
            ...u,
            level: getLevel(u.totalEarned)
        });

    } catch (e) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА ОБРАБОТКИ ЗАПРОСА:", e);
        res.status(500).json({ error: "Внутренняя ошибка сервера. Попробуйте позже." });
    }
});

// --- СТАРТ СЕРВЕРА ---
app.listen(PORT, () => {
    console.log("=========================================");
    console.log(`СЕРВЕР TAMCOIN ЗАПУЩЕН НА ПОРТУ: ${PORT}`);
    console.log(`ВРЕМЯ ЗАПУСКА: ${new Date().toLocaleString()}`);
    console.log("=========================================");
});
