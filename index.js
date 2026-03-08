/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE HEAVY MONOLITH ENGINE
 * [VERSION]: 6.5.7 "NITRO REFERRAL & TWIN-TURBO"
 * [AUTHOR]: GEMINI & THE MASTER (KARAGANDA CORE)
 * ==========================================================================
 * ТЕХНИЧЕСКИЙ ПАСПОРТ МОНОЛИТА:
 * 1. КУРС ВАЛЮТЫ: 1 TON = 10 NF (NITRO FUEL). 
 * 2. МАТЕМАТИКА СПИНА: 2 NF (0.2 TON) ЗА КРУТКУ. МАРЖА: 50% В КАССУ.
 * 3. РЕФЕРАЛЬНЫЙ ВПРЫСК: +1 BOX ОБОИМ ПРИ ВХОДЕ, +1 BOX ЗА 50 ЗАБРОСОВ.
 * 4. TWIN-TURBO: ВЕЧНАЯ ЛИЦЕНЗИЯ, АВТО-ПРОДАЖА РЫБЫ, X2 ОПЫТ (XP).
 * 5. БЕЗОПАСНОСТЬ: ВЕРИФИКАЦИЯ ТРАНЗАКЦИЙ TON ПО HASH.
 * ==========================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --------------------------------------------------------------------------
// [1] КОНФИГУРАЦИЯ СЕТИ, ПЛАТЕЖЕЙ И ТЕЛЕГРАМ-БОТА
// --------------------------------------------------------------------------
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const MY_TON_WALLET = 'UQAQZE0WB6mmLAAq0XCTlipocPlrqopaxHgXFmOmp-fCFBJh';
const TONCENTER_API_KEY = '360540e7a910fec0124ef783d85d607d0963e0c26d204b49d3500fc452be5c15';

/**
 * ПРАЙС-ЛИСТ ТОВАРОВ (ЦЕНЫ В TON)
 * Сверка происходит автоматически при сканировании блокчейна.
 */
const PRICES_TON = {
    'vip_bait': 1.0,        // VIP Приманка (7 дней)
    'titan_rod_7': 1.0,     // Титановая удочка (7 дней)
    'hope_lake_7': 2.0,     // Озеро Надежды (7 дней)
    'vip_status_14': 3.0,   // VIP Статус (14 дней)
    'myakish_100': 0.5,     // 100 Хлебных мякишей
    'energy_boost': 0.2,    // Энергетик (100% энергии)
    'nitro_refuel_1': 1.0,  // Заправка: 10 NF (Nitro Fuel)
    'nitro_refuel_5': 5.0,  // Заправка: 50 NF (Nitro Fuel)
    'turbo_license': 5.0    // TWIN-TURBO (Вечная лицензия на авто-продажу)
};

// --------------------------------------------------------------------------
// [2] ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ СЕРВЕРА
// --------------------------------------------------------------------------
let users = {};
let processedTxs = []; 
let logs = ["Сервер 6.5.7: NITRO-TURBO МОНОЛИТ ЗАПУЩЕН 🚀"];
let serverEvents = [
    "Система: Автопилот TON активен", 
    "Рефералы: Бонусы за вход и 50 забросов активны", 
    "Тюнинг: Твин-Турбо наддув готов к работе"
];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { weeklyCarpCaught: 0, lastReset: Date.now() };

const MIN_JACKPOT = 1000;
const SELL_PRICE = 2; 
const TAX_RATE = 0.05; 

// --------------------------------------------------------------------------
// [3] МАТЕМАТИЧЕСКИЙ ДВИЖОК: NITRO WHEEL (МАРЖА 50%)
// --------------------------------------------------------------------------
/**
 * Функция просчитывает результат крутки за 2 NF.
 * Сбалансировано так, чтобы 50% TON в итоге оставалось у тебя.
 */
function spinNitroWheel(u) {
    const rnd = Math.random() * 100;
    let prize = "";
    
    // 40% - ПУСТО (Твой основной заработок)
    if (rnd < 40) {
        prize = "ПУСТО! 💨 (Попробуй еще раз)";
    } 
    
    // 25% - ИГРОВАЯ ВАЛЮТА (TC)
    else if (rnd < 65) {
        const win = 500 + Math.floor(Math.random() * 1500);
        u.b += win;
        prize = `💰 +${win} TC (На игровой счет)`;
    }
    
    // 15% - ХЛЕБНЫЙ МЯКИШ (Расходник)
    else if (rnd < 80) {
        u.buffs.myakish += 200;
        prize = "🍞 200 ХЛЕБНОГО МЯКИША";
    }
    
    // 10% - VIP СТАТУС (24 часа)
    else if (rnd < 90) {
        const day = 24 * 60 * 60 * 1000;
        u.buffs.vip = Math.max(Date.now(), u.buffs.vip || 0) + day;
        prize = "⭐ VIP СТАТУС НА 24 ЧАСА!";
    }
    
    // 8% - ВОЗВРАТ NF (X2 ВЫИГРЫШ)
    else if (rnd < 98) {
        u.nf = (u.nf || 0) + 4;
        prize = "🏎️ ВЫИГРЫШ X2! (+4 NF)";
    }
    
    // 2% - JACKPOT (X10 ОТ СТАВКИ)
    else {
        u.nf = (u.nf || 0) + 20;
        prize = "🔥 JACKPOT! (+20 NF) 🔥";
    }
    
    return prize;
}

// --------------------------------------------------------------------------
// [4] АВТОМАТИЧЕСКИЙ СКАНЕР ТРАНЗАКЦИЙ TON (БЛОКЧЕЙН-МОНИТОР)
// --------------------------------------------------------------------------
async function checkTonPayments() {
    try {
        const url = `https://toncenter.com/api/v2/getTransactions?address=${MY_TON_WALLET}&limit=10&to_lt=0&archival=false`;
        const res = await axios.get(url, { headers: { 'X-API-Key': TONCENTER_API_KEY } });
        
        if (!res.data || !res.data.ok) return;

        const transactions = res.data.result;

        for (const tx of transactions) {
            const hash = tx.transaction_id.hash;
            
            // Защита от двойного зачисления (Hash Check)
            if (processedTxs.includes(hash)) continue;

            const inMsg = tx.in_msg;
            if (!inMsg || !inMsg.message) {
                processedTxs.push(hash);
                continue;
            }

            const memo = inMsg.message; 
            const amount = parseFloat(inMsg.value) / 1000000000;

            // СЦЕНАРИЙ 1: ПОПОЛНЕНИЕ ТОПЛИВА (DEPOSIT)
            if (memo.includes('_DEPOSIT')) {
                const uId = memo.split('_')[1];
                if (users[uId]) {
                    const nfAdded = Math.floor(amount * 10); // 1 TON = 10 NF
                    users[uId].nf = (users[uId].nf || 0) + nfAdded;
                    processedTxs.push(hash);
                    saveData();
                    
                    addLog(`Депозит: ${users[uId].n} +${nfAdded} NF`);
                    await sendTgMessage(uId, `⛽ БАК ЗАПРАВЛЕН!\nВы получили ${nfAdded} NF за перевод ${amount} TON.`);
                    await sendTgMessage(ADMIN_ID, `💰 КАССА: +${amount} TON от ${users[uId].n}. Начислено ${nfAdded} NF.`);
                }
            }
            
            // СЦЕНАРИЙ 2: ПРЯМАЯ ПОКУПКА ТОВАРА ПО ЦЕННИКУ
            else if (memo.startsWith('FISH_')) {
                const parts = memo.split('_');
                const uId = parts[1];
                const itemId = parts[2];

                if (users[uId] && PRICES_TON[itemId] <= (amount + 0.01)) {
                    applyItem(users[uId], itemId);
                    processedTxs.push(hash);
                    saveData();
                    
                    addLog(`Продажа: ${users[uId].n} -> ${itemId}`);
                    await sendTgMessage(uId, `✅ ПОКУПКА ОДОБРЕНА!\nТовар: ${itemId} активирован в профиле.`);
                    await sendTgMessage(ADMIN_ID, `🛍️ ПРОДАЖА: ${users[uId].n} купил ${itemId} за ${amount} TON.`);
                }
            }
            
            processedTxs.push(hash);
            
            // Ограничение истории хэшей
            if (processedTxs.length > 1000) processedTxs.shift();
        }
    } catch (e) { 
        console.error("Ошибка сканера TON (Критическая):", e.message); 
    }
}

// Запуск фоновой проверки раз в 60 секунд
setInterval(checkTonPayments, 60000);

// --------------------------------------------------------------------------
// [5] СИСТЕМА ХРАНЕНИЯ ДАННЫХ (DATABASE JSON ENGINE)
// --------------------------------------------------------------------------
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            processedTxs = data.processedTxs || [];
            jackpot = data.jackpot || { pool: MIN_JACKPOT, lastWinner: "Никто" };
            globalState = data.globalState || { weeklyCarpCaught: 0, lastReset: Date.now() };
        } catch(e) { 
            console.error("Ошибка загрузки базы данных JSON:", e); 
        }
    }
}

function saveData() { 
    try {
        const dataToSave = { 
            users, 
            processedTxs, 
            jackpot, 
            globalState, 
            lastSave: Date.now() 
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
    } catch (e) {
        console.error("Критическая ошибка сохранения базы данных:", e);
    }
}

// Инициализация базы при запуске
loadData();

/**
 * Логирование действий пользователей и системных событий
 */
function addLog(m) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${m}`);
    serverEvents.unshift(m);
    
    if(logs.length > 25) logs.pop();
    if(serverEvents.length > 15) serverEvents.pop();
}

// --------------------------------------------------------------------------
// [6] ИГРОВЫЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (LEVELS, TG, ITEMS)
// --------------------------------------------------------------------------
/**
 * Проверка повышения уровня пользователя (XP System)
 */
function checkLevelUp(u) {
    const nextLevelXP = u.level * 500; 
    if (u.xp >= nextLevelXP) {
        u.xp -= nextLevelXP;
        u.level += 1;
        sendTgMessage(u.id, `🎉 УРОВЕНЬ МАСТЕРСТВА ПОВЫШЕН! Теперь у вас ${u.level} LVL!`);
        addLog(`${u.n} взял ${u.level} уровень`);
        return true;
    }
    return false;
}

/**
 * Прямая отправка уведомлений в Telegram пользователю
 */
async function sendTgMessage(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text
        });
    } catch (e) { 
        console.error("Ошибка Telegram API:", e.message); 
    }
}

/**
 * Применение свойств предметов к профилю пользователя
 */
function applyItem(u, item) {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const fortnight = 14 * 24 * 60 * 60 * 1000;

    if (item === 'vip_bait') u.buffs.bait = now + week;
    if (item === 'titan_rod_7') u.buffs.titan = now + week;
    if (item === 'hope_lake_7') u.buffs.hope = now + week;
    if (item === 'vip_status_14') u.buffs.vip = now + fortnight;
    if (item === 'turbo_license') u.isTurbo = true;
    
    // Пакетная заправка Nitro Fuel (NF)
    if (item === 'nitro_refuel_1') u.nf = (u.nf || 0) + 10;
    if (item === 'nitro_refuel_5') u.nf = (u.nf || 0) + 50;

    if (item === 'myakish_100') u.buffs.myakish += 100;
}

// --------------------------------------------------------------------------
// [7] ГЛАВНЫЙ ОБРАБОТЧИК API (ACTION ENGINE CORE)
// --------------------------------------------------------------------------
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "userId is required" });

    // РЕГИСТРАЦИЯ И РЕФЕРАЛЬНЫЙ ТЮНИНГ (ВЫДАЧА КОРОБОК)
    if (!users[userId]) {
        const refBy = payload?.refBy || null; // ID пригласившего игрока
        
        users[userId] = {
            id: userId,
            n: userName || "Рыбак",
            b: 150,
            nf: 0,
            fish: 0,
            energy: 50,
            dur: 100,
            level: 1,
            xp: 0,
            isTurbo: false,
            total: 0,
            lastBonus: 0,
            lastUpdate: now,
            buffs: { titan: 0, hope: 0, vip: 0, bait: 0, myakish: 0 },
            stats: { boxes: 1, castsAsRef: 0 }, // +1 Коробка новичку в подарок
            referrer: refBy,
            isBanned: false,
            isAdmin: (userId === ADMIN_ID)
        };

        // БОНУС ПРИГЛАСИТЕЛЮ (СТУПЕНЬ 1: ЗА ФАКТ ВХОДА)
        if (refBy && users[refBy]) {
            users[refBy].stats.boxes = (users[refBy].stats.boxes || 0) + 1;
            sendTgMessage(refBy, `🎁 По твоей ссылке зашел новый рыбак! Ты получил Коробку Удачи!`);
        }
        
        addLog(`Новый игрок: ${users[userId].n} (Пришел по реф: ${refBy || 'нет'})`);
    }

    const u = users[userId];
    
    // Проверка бана
    if (u.isBanned && userId !== ADMIN_ID) {
        return res.status(403).json({ error: "BANNED" });
    }

    // Совместимость полей (защита от крашей старых аккаунтов)
    if (u.nf === undefined) u.nf = 0;
    if (u.isTurbo === undefined) u.isTurbo = false;
    if (u.level === undefined) u.level = 1;
    if (u.xp === undefined) u.xp = 0;

    const isVip = u.buffs.vip > now;
    const isTurbo = u.isTurbo === true;
    const hasTitan = u.buffs.titan > now || isVip;

    // Регенерация энергии в реальном времени (для не-VIP)
    if (!isVip) {
        const passed = now - u.lastUpdate;
        if (passed > 300000) { 
            const reg = Math.floor(passed / 300000);
            u.energy = Math.min(50, u.energy + reg); 
            u.lastUpdate = now;
        }
    } else { 
        u.energy = 100; // У VIP аккаунтов энергия всегда на максимуме
    }

    let msg = ""; 
    let catchData = null;

    // ОБРАБОТЧИК ДЕЙСТВИЙ (SWITCH LOGIC)
    switch (action) {
        
        case 'load': 
            // Просто загрузка данных профиля
            break;

        case 'cast':
            if (!isVip && u.energy < 2) { msg = "НЕТ ЭНЕРГИИ!"; break; }
            if (!hasTitan && u.dur <= 0) { msg = "УДОЧКА СЛОМАНА! ПОЧИНИ В МАГАЗИНЕ."; break; }
            
            // Расход ресурсов за попытку
            if (!isVip) u.energy -= 2;
            if (!hasTitan) u.dur = Math.max(0, u.dur - 1);
            u.total++;

            // БОНУС ПРИГЛАСИТЕЛЮ (СТУПЕНЬ 2: ЗА АКТИВНОСТЬ РЕФЕРАЛА)
            u.stats.castsAsRef = (u.stats.castsAsRef || 0) + 1;
            if (u.referrer && u.stats.castsAsRef === 50) {
                if (users[u.referrer]) {
                    users[u.referrer].stats.boxes++;
                    sendTgMessage(u.referrer, "🎁 Твой реферал активен (50 забросов)! Ты получил вторую Коробку Удачи!");
                }
            }

            // РАСЧЕТ XP (Твин-Турбо дает двойной опыт)
            let xpAdd = (isVip ? 2 : 1) * (isTurbo ? 2 : 1);
            u.xp += xpAdd;
            checkLevelUp(u);

            // РАСЧЕТ ВЕСА УЛОВА
            let weight = (Math.random() * 2.5 + 0.5);
            // VIP Приманка увеличивает вес
            if (u.buffs.bait > now) {
                const goldHour = new Date().getMinutes() < 10;
                weight *= (goldHour ? 6 : 3);
            }

            // МЕХАНИКА ТВИН-ТУРБО (Автоматическая продажа рыбы)
            if (isTurbo) {
                const instantCash = Math.floor(weight * SELL_PRICE);
                u.b += instantCash;
                u.xp += (isVip ? 10 : 5); // Доп XP за продажу
                checkLevelUp(u);
                catchData = { 
                    type: "Рыба (TURBO-SELL)", 
                    w: `${weight.toFixed(2)} кг -> +${instantCash} TC` 
                };
            } else {
                u.fish += weight;
                catchData = { type: "Рыба", w: weight.toFixed(2) + " кг" };
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "САДОК ПУСТ!"; break; }
            const income = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(income * TAX_RATE);
            
            jackpot.pool += tax;
            u.b += (income - tax);
            u.fish = 0;
            
            u.xp += (isVip ? 10 : 5);
            msg = `РЫБА ПРОДАНА! +${income - tax} TC НА БАЛАНС.`;
            checkLevelUp(u);
            break;

        case 'spin_nitro':
            // ГЛАВНАЯ ФУНКЦИЯ КОЛЕСА УДАЧИ ЗА 2 NF
            if (u.nf < 2) { 
                msg = "ОШИБКА: НУЖНО ТОПЛИВО (2 NF)! ЗАПРАВЬСЯ В МАГАЗИНЕ."; 
                break; 
            }
            u.nf -= 2;
            const prize = spinNitroWheel(u);
            msg = `🎡 NITRO-РЕЗУЛЬТАТ: ${prize}`;
            saveData();
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { 
                msg = "ЕЩЕ НЕ ВРЕМЯ! БОНУС ДОСТУПЕН РАЗ В СУТКИ."; 
            } else {
                u.b += 100; 
                u.lastBonus = now; 
                msg = "ЕЖЕДНЕВНЫЙ БОНУС 100 TC ПОЛУЧЕН!"; 
            }
            break;

        case 'buy':
            const item = payload.id;
            
            // Быстрый ремонт за игровую валюту
            if (item === 'repair' && u.b >= 50) { 
                u.b -= 50; 
                u.dur = 100; 
                msg = "УДОЧКА ПОЛНОСТЬЮ ВОССТАНОВЛЕНА!"; 
                break; 
            }
            
            // Обработка запросов на покупку за TON (выставление счета)
            const tonPrice = PRICES_TON[item];
            if (tonPrice) {
                msg = `СЧЕТ НА ${tonPrice} TON ОТПРАВЛЕН В ТВОЙ ТЕЛЕГРАМ!`;
                sendTgMessage(userId, `🛍 ВАШ ЗАКАЗ: ${item}\n💰 СУММА К ОПЛАТЕ: ${tonPrice} TON\n🏦 КОШЕЛЕК: ${MY_TON_WALLET}\n🏦 MEMO: FISH_${userId}_${item}\n\n⚠️ Обязательно укажите MEMO при переводе!`);
            }
            break;
            
        // ------------------------------------------------------------------
        // [ADMIN PANEL FUNCTIONS]
        // ------------------------------------------------------------------
        case 'admin_get_all':
            if (userId === ADMIN_ID) {
                return res.json({ 
                    allUsers: Object.values(users), 
                    jackpot, 
                    events: serverEvents,
                    logs: logs
                });
            }
            break;

        case 'admin_user_op':
            if (userId !== ADMIN_ID) return res.status(403).end();
            const target = users[payload.targetId];
            if (target) {
                if (payload.op === 'add_money') target.b += parseInt(payload.val);
                if (payload.op === 'add_nf') target.nf = (target.nf || 0) + parseInt(payload.val);
                if (payload.op === 'ban') target.isBanned = !target.isBanned;
                msg = "АДМИН-ДЕЙСТВИЕ: ВЫПОЛНЕНО УСПЕШНО!";
            }
            break;
    }
    
    saveData();
    // Ответ сервера клиенту
    res.json({ 
        ...u, 
        jackpot, 
        events: serverEvents, 
        msg, 
        catchData 
    });
});

/**
 * ИНИЦИАЛИЗАЦИЯ И ЗАПУСК HTTP СЕРВЕРА
 */
app.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`TAMAC NITRO MONOLITH 6.5.7 - ENGINE ON`);
    console.log(`ПОРТ: ${PORT}`);
    console.log(`КОШЕЛЕК МАСТЕРА: ${MY_TON_WALLET}`);
    console.log(`----------------------------------------`);
});
