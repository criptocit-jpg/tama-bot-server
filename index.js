/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 6.5.2 "NITRO FUEL EDITION"
 * [AUTHOR]: GEMINI & THE MASTER
 * ==========================================================================
 * МАТЕМАТИКА ЭКОНОМИКИ:
 * 1. ВАЛЮТА: 1 TON = 10 NF (NITRO FUEL).
 * 2. СТОИМОСТЬ СПИНА: 2 NF (ЭКВИВАЛЕНТ 0.2 TON).
 * 3. ДОХОДНОСТЬ (RTP): 50% В ПОЛЬЗУ ИГРОКА / 50% В КАССУ МАСТЕРА.
 * 4. БЕЗОПАСНОСТЬ: ПРОВЕРКА HASH ТРАНЗАКЦИЙ ДЛЯ ЗАЩИТЫ ОТ ПОВТОРОВ.
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
// [1] КОНФИГУРАЦИЯ СЕТИ И ПЛАТЕЖЕЙ (TON & TELEGRAM)
// --------------------------------------------------------------------------
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const MY_TON_WALLET = 'UQAQZE0WB6mmLAAq0XCTlipocPlrqopaxHgXFmOmp-fCFBJh';
const TONCENTER_API_KEY = '360540e7a910fec0124ef783d85d607d0963e0c26d204b49d3500fc452be5c15';

/**
 * ПРАЙС-ЛИСТ (ЦЕНЫ В TON)
 * Используется для автоматической верификации платежей ботом.
 */
const PRICES_TON = {
    'vip_bait': 1.0,        // VIP Приманка (7 дней)
    'titan_rod_7': 1.0,     // Титановая удочка (7 дней)
    'hope_lake_7': 2.0,     // Озеро Надежды (7 дней)
    'vip_status_14': 3.0,   // VIP Статус (14 дней)
    'myakish_100': 0.5,     // 100 Хлебных мякишей
    'energy_boost': 0.2,    // Энергетик (100% энергии)
    'nitro_refuel_1': 1.0,  // Заправка: 10 NF
    'nitro_refuel_5': 5.0,  // Заправка: 50 NF
    'turbo_license': 5.0    // TWIN-TURBO (Вечная лицензия)
};

// --------------------------------------------------------------------------
// [2] ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И ХРАНИЛИЩЕ
// --------------------------------------------------------------------------
let users = {};
let processedTxs = []; 
let logs = ["Сервер 6.5.2: NITRO МОНОЛИТ ЗАПУЩЕН 🚀"];
let serverEvents = [
    "Система: Автопилот TON активен", 
    "Экономика: Маржа 50% установлена", 
    "Тюнинг: Твин-Турбо готов"
];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { weeklyCarpCaught: 0, lastReset: Date.now() };
let withdrawRequests = []; 

const MIN_JACKPOT = 1000;
const SELL_PRICE = 2; 
const TAX_RATE = 0.05; 

// --------------------------------------------------------------------------
// [3] ЯДРО УДАЧИ: NITRO WHEEL (МАТЕМАТИЧЕСКИЙ ПРОСЧЕТ)
// --------------------------------------------------------------------------
/**
 * Функция спина за 2 NF. 
 * Гарантирует, что в долгосроке 50% TON остается у владельца.
 */
function spinNitroWheel(u) {
    const rnd = Math.random() * 100;
    let prize = "";
    
    // ГРУППА 1: "ПУСТО" (40% шанса) - ЧИСТЫЙ ПРОФИТ МАСТЕРА
    if (rnd < 40) {
        prize = "ПУСТО! 💨 (Попробуй еще раз)";
    } 
    
    // ГРУППА 2: "ИГРОВАЯ ВАЛЮТА" (25% шанса) - НУЛЕВАЯ СЕБЕСТОИМОСТЬ
    else if (rnd < 65) {
        const win = 500 + Math.floor(Math.random() * 1500);
        u.b += win;
        prize = `💰 +${win} TC (На игровой счет)`;
    }
    
    // ГРУППА 3: "РАСХОДНИКИ" (15% шанса) - НУЛЕВАЯ СЕБЕСТОИМОСТЬ
    else if (rnd < 80) {
        u.buffs.myakish += 200;
        prize = "🍞 200 ХЛЕБНОГО МЯКИША";
    }
    
    // ГРУППА 4: "VIP ЛОЯЛЬНОСТЬ" (10% шанса) - ПОВЫШАЕТ УДЕРЖАНИЕ
    else if (rnd < 90) {
        const day = 24 * 60 * 60 * 1000;
        u.buffs.vip = Math.max(Date.now(), u.buffs.vip || 0) + day;
        prize = "⭐ VIP СТАТУС НА 24 ЧАСА!";
    }
    
    // ГРУППА 5: "ВОЗВРАТ NF / X2" (8% шанса) - РИСК 0.4 TON
    else if (rnd < 98) {
        u.nf = (u.nf || 0) + 4;
        prize = "🏎️ ВЫИГРЫШ X2! (+4 NF)";
    }
    
    // ГРУППА 6: "JACKPOT" (2% шанса) - РИСК 2.0 TON
    else {
        u.nf = (u.nf || 0) + 20;
        prize = "🔥 JACKPOT! (+20 NF) 🔥";
    }
    
    return prize;
}

// --------------------------------------------------------------------------
// [4] АВТОМАТИЧЕСКИЙ МОНИТОРИНГ БЛОКЧЕЙНА TON
// --------------------------------------------------------------------------
async function checkTonPayments() {
    try {
        const url = `https://toncenter.com/api/v2/getTransactions?address=${MY_TON_WALLET}&limit=10&to_lt=0&archival=false`;
        const res = await axios.get(url, { headers: { 'X-API-Key': TONCENTER_API_KEY } });
        
        if (!res.data || !res.data.ok) return;

        const transactions = res.data.result;

        for (const tx of transactions) {
            const hash = tx.transaction_id.hash;
            
            // Защита от двойного зачисления (проверка хэша)
            if (processedTxs.includes(hash)) continue;

            const inMsg = tx.in_msg;
            if (!inMsg || !inMsg.message) {
                processedTxs.push(hash);
                continue;
            }

            const memo = inMsg.message; 
            const amount = parseFloat(inMsg.value) / 1000000000;

            // СЦЕНАРИЙ А: ЗАПРАВКА ТОПЛИВОМ (DEPOSIT)
            if (memo.includes('_DEPOSIT')) {
                const uId = memo.split('_')[1];
                if (users[uId]) {
                    const nfAdded = Math.floor(amount * 10); // 1 TON = 10 NF
                    users[uId].nf = (users[uId].nf || 0) + nfAdded;
                    processedTxs.push(hash);
                    saveData();
                    
                    addLog(`Заправка: ${users[uId].n} +${nfAdded} NF`);
                    await sendTgMessage(uId, `⛽ БАК ЗАПРАВЛЕН!\nВы получили ${nfAdded} NF за перевод ${amount} TON.`);
                    await sendTgMessage(ADMIN_ID, `💰 ДЕПОЗИТ: +${amount} TON от ${users[uId].n}. Начислено ${nfAdded} NF.`);
                }
            }
            // СЦЕНАРИЙ Б: ПРЯМАЯ ПОКУПКА ТОВАРА (SHOP)
            else if (memo.startsWith('FISH_')) {
                const parts = memo.split('_');
                const uId = parts[1];
                const itemId = parts[2];

                if (users[uId] && PRICES_TON[itemId] <= (amount + 0.01)) {
                    applyItem(users[uId], itemId);
                    processedTxs.push(hash);
                    saveData();
                    
                    addLog(`Продажа: ${users[uId].n} -> ${itemId}`);
                    await sendTgMessage(uId, `✅ ПОКУПКА ПОДТВЕРЖДЕНА!\nТовар: ${itemId} активирован.`);
                    await sendTgMessage(ADMIN_ID, `🛍️ КАССА: ${users[uId].n} купил ${itemId} за ${amount} TON.`);
                }
            }
            
            // Фиксация хэша в базе
            processedTxs.push(hash);
            
            // Ограничение размера массива хэшей для экономии памяти
            if (processedTxs.length > 1000) processedTxs.shift();
        }
    } catch (e) { 
        console.error("Ошибка сканера TON (Критическая):", e.message); 
    }
}

// Фоновая проверка раз в 60 секунд (Оптимально для TonCenter)
setInterval(checkTonPayments, 60000);

// --------------------------------------------------------------------------
// [5] РАБОТА С БАЗОЙ ДАННЫХ (JSON ENGINE)
// --------------------------------------------------------------------------
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            processedTxs = data.processedTxs || [];
            jackpot = data.jackpot || { pool: MIN_JACKPOT, lastWinner: "Никто" };
            globalState = data.globalState || { weeklyCarpCaught: 0, lastReset: Date.now() };
            withdrawRequests = data.withdrawRequests || [];
        } catch(e) { 
            console.error("Критическая ошибка загрузки JSON:", e); 
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
            withdrawRequests, 
            lastSave: Date.now() 
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
    } catch (e) {
        console.error("Ошибка сохранения базы данных:", e);
    }
}

// Инициализация данных при старте
loadData();

/**
 * Логирование событий сервера
 */
function addLog(m) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${m}`);
    serverEvents.unshift(m);
    if(logs.length > 20) logs.pop();
    if(serverEvents.length > 15) serverEvents.pop();
}

// --------------------------------------------------------------------------
// [6] ИГРОВЫЕ МЕХАНИКИ (XP, ITEMS, TG)
// --------------------------------------------------------------------------
/**
 * Система уровней: прогрессия 500 XP за уровень
 */
function checkLevelUp(u) {
    const nextLevelXP = u.level * 500; 
    if (u.xp >= nextLevelXP) {
        u.xp -= nextLevelXP;
        u.level += 1;
        sendTgMessage(u.id, `🎉 МАСТЕРСТВО РАСТЕТ! Теперь у вас ${u.level} LVL!`);
        addLog(`${u.n} получил уровень ${u.level}`);
        return true;
    }
    return false;
}

/**
 * Отправка сообщений пользователям через бота
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
 * Применение купленного товара к пользователю
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
    
    // Пакетная заправка NF (Nitro Fuel)
    if (item === 'nitro_refuel_1') u.nf = (u.nf || 0) + 10;
    if (item === 'nitro_refuel_5') u.nf = (u.nf || 0) + 50;

    if (item === 'myakish_100') u.buffs.myakish += 100;
    if (item === 'energy_boost') {
        u.energy = (u.buffs.vip > now) ? 100 : 50;
    }
}

// --------------------------------------------------------------------------
// [7] API ОБРАБОТЧИК (CORE ACTION ENGINE)
// --------------------------------------------------------------------------
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "No userId provided" });

    // Регистрация нового игрока
    if (!users[userId]) {
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
            stats: { boxes: 0, castsAsRef: 0 },
            isBanned: false,
            isAdmin: (userId === ADMIN_ID)
        };
        addLog(`Новый игрок: ${users[userId].n}`);
    }

    const u = users[userId];
    if (u.isBanned) return res.status(403).json({ error: "BANNED_BY_ADMIN" });

    // Обработка отсутствующих полей (совместимость версий)
    if (u.nf === undefined) u.nf = 0;
    if (u.isTurbo === undefined) u.isTurbo = false;
    if (u.level === undefined) u.level = 1;
    if (u.xp === undefined) u.xp = 0;

    const isVip = u.buffs.vip > now;
    const isTurbo = u.isTurbo === true;
    const hasTitan = u.buffs.titan > now || isVip;

    // Регенерация энергии в реальном времени
    if (!isVip) {
        const passed = now - u.lastUpdate;
        if (passed > 300000) { 
            const reg = Math.floor(passed / 300000);
            u.energy = Math.min(50, u.energy + reg); 
            u.lastUpdate = now;
        }
    } else {
        u.energy = 100; // У VIP энергия всегда 100%
    }

    let msg = ""; 
    let catchData = null;

    // --- ОБРАБОТКА ДЕЙСТВИЙ ---
    switch (action) {
        
        case 'load': 
            msg = "Данные синхронизированы"; 
            break;

        case 'cast':
            if (!isVip && u.energy < 2) { msg = "ЭНЕРГИЯ НА НУЛЕ!"; break; }
            if (!hasTitan && u.dur <= 0) { msg = "УДОЧКА СЛОМАНА!"; break; }
            
            // Расход ресурсов
            if (!isVip) u.energy -= 2;
            if (!hasTitan) u.dur = Math.max(0, u.dur - 1);
            u.total++;

            // Начисление опыта (Турбо-лицензия дает x2 XP)
            let xpAdd = isVip ? 2 : 1;
            if (isTurbo) xpAdd *= 2;
            u.xp += xpAdd;
            checkLevelUp(u);

            // Расчет веса рыбы
            let weight = (Math.random() * 2.5 + 0.5);
            const isGoldHour = new Date().getMinutes() < 10;
            if (u.buffs.bait > now) weight *= (isGoldHour ? 6 : 3);

            // ТУРБО-РЕЖИМ (Автоматическая мгновенная продажа)
            if (isTurbo) {
                const instantCash = Math.floor(weight * SELL_PRICE);
                u.b += instantCash;
                u.xp += (isVip ? 10 : 5);
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
            checkLevelUp(u);
            
            msg = `Улов продан за ${income - tax} TC!`;
            break;

        case 'spin_wheel':
            // КРУТКА НИТРО-КОЛЕСА ЗА 2 NF (или за TC по твоему выбору)
            const cur = payload.cur; // 'tc' или 'unit'
            
            if (cur === 'unit') {
                if (u.nf < 2) { msg = "НУЖНО ТОПЛИВО (2 NF)!"; break; }
                u.nf -= 2;
            } else {
                if (u.b < 100) { msg = "НЕДОСТАТОЧНО TC!"; break; }
                u.b -= 100;
            }

            const prizeResult = spinNitroWheel(u);
            msg = `🎡 NITRO-РЕЗУЛЬТАТ: ${prizeResult}`;
            saveData();
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { 
                msg = "ЕЩЕ НЕ ВРЕМЯ (РАЗ В 24Ч)!"; 
            } else {
                u.b += 100; 
                u.lastBonus = now; 
                msg = "ПОЛУЧЕНО 100 TC!"; 
            }
            break;

        case 'buy':
            const item = payload.id;
            // Ремонт за TC
            if (item === 'repair' && u.b >= 50) { 
                u.b -= 50; 
                u.dur = 100; 
                msg = "УДОЧКА КАК НОВАЯ!"; 
                break; 
            }
            
            // Выставление счета в TON
            const tonPrice = PRICES_TON[item];
            if (tonPrice) {
                msg = `СЧЕТ ОТПРАВЛЕН В ТЕЛЕГРАМ!`;
                sendTgMessage(userId, `🛍 ЗАКАЗ: ${item}\n💰 СУММА: ${tonPrice} TON\n🏦 КОШЕЛЕК: ${MY_TON_WALLET}\n🏦 MEMO: FISH_${userId}_${item}`);
            }
            break;
            
        // ------------------------------------------------------------------
        // [ADMIN ZONE]
        // ------------------------------------------------------------------
        case 'admin_get_all':
            if (userId === ADMIN_ID) {
                return res.json({ 
                    allUsers: Object.values(users), 
                    jackpot, 
                    events: serverEvents,
                    logs: logs.slice(0, 50)
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
                msg = "АДМИН: ДЕЙСТВИЕ ВЫПОЛНЕНО!";
            }
            break;
    }
    
    saveData();
    // Ответ клиенту: мапим nf в units для фронтенда
    res.json({ 
        ...u, 
        units: u.nf, // Фронтенд ожидает units
        jackpot, 
        events: serverEvents, 
        msg, 
        catchData 
    });
});

/**
 * ЗАПУСК СЕРВЕРА
 */
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`TAMAC NITRO MONOLITH 6.5.2 - ОНЛАЙН`);
    console.log(`ПОРТ: ${PORT}`);
    console.log(`КОШЕЛЕК: ${MY_TON_WALLET}`);
    console.log(`========================================`);
});
