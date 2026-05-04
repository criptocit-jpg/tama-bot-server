/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 6.5.2 "NITRO FUEL EDITION"
 * [AUTHOR]: GEMINI & THE MASTER
 * ==========================================================================
 * МАТЕМАТИКА ЭКОНОМИКИ:
 * 1. ВАЛЮТА: 1 TON = 10 Units.
 * 2. СТОИМОСТЬ СПИНА: 2 Units (ЭКВИВАЛЕНТ 0.2 TON).
 * 3. ДОХОДНОСТЬ (RTP): 50% В ПОЛЬЗУ ИГРОКА / 50% В КАССУ МАСТЕРА.
 * 4. БЕЗОПАСНОСТЬ: ПРОВЕРКА HASH ТРАНЗАКЦИЙ ДЛЯ ЗАЩИТЫ ОТ ПОВТОРОВ.
 * ==========================================================================
 */

require('dotenv').config();

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
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; 
const MY_TON_WALLET = process.env.MY_TON_WALLET;
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY;

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
    'nitro_refuel_1': 1.0,  // Заправка: 10 Units
    'nitro_refuel_5': 5.0,  // Заправка: 50 Units
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
const MIN_DEPOSIT_AMOUNT = 0.1; // TON
let isChecking = false;

// --------------------------------------------------------------------------
// [3] ЯДРО УДАЧИ: NITRO WHEEL (МАТЕМАТИЧЕСКИЙ ПРОСЧЕТ)
// --------------------------------------------------------------------------
/**
 * Функция спина за 2 Units. 
 * Гарантирует, что в долгосроке 50% TON остается у владельца.
 */
function spinFortuneWheel(u) {
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
    
    // ГРУППА 5: "ВОЗВРАТ Units / X2" (8% шанса) - РИСК 0.4 TON
    else if (rnd < 98) {
        u.units = (u.units || 0) + 4;
        prize = "🏎️ ВЫИГРЫШ X2! (+4 Units)";
    }
    
    // ГРУППА 6: "JACKPOT" (2% шанса) - РИСК 2.0 TON
    else {
        u.units = (u.units || 0) + 20;
        prize = "🔥 JACKPOT! (+20 Units) 🔥";
    }
    
    return prize;
}

// --------------------------------------------------------------------------
// [4] АВТОМАТИЧЕСКИЙ МОНИТОРИНГ БЛОКЧЕЙНА TON
// --------------------------------------------------------------------------
async function checkTonPayments() {
    if (isChecking) return;
    isChecking = true;
    try {
        const url = `https://toncenter.com/api/v2/getTransactions?address=${MY_TON_WALLET}&limit=10&to_lt=0&archival=false`;
        let res;
        try {
            res = await axios.get(url, { headers: { 'X-API-Key': TONCENTER_API_KEY } });
        } catch (apiErr) {
            console.error("Ошибка запроса к TonCenter:", apiErr.message);
            return;
        }
        
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
            const destination = inMsg.destination || tx.destination || tx.account;

            // Валидация кошелька-получателя (должен совпадать с нашим)
            if (!destination || destination !== MY_TON_WALLET) {
                processedTxs.push(hash);
                continue;
            }

            // Игнорируем микроплатежи, но помечаем как обработанные
            if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_AMOUNT) {
                processedTxs.push(hash);
                continue;
            }

            // СЦЕНАРИЙ А: ЗАПРАВКА ТОПЛИВОМ (DEPOSIT)
            if (memo.includes('_DEPOSIT')) {
                const uId = memo.split('_')[1];
                if (users[uId]) {
                    const unitsAdded = Math.floor(amount * 10); // 1 TON = 10 Units
                    users[uId].units = (users[uId].units || 0) + unitsAdded;
                    users[uId].unitsEarned = (users[uId].unitsEarned || 0) + unitsAdded;
                    users[uId].totalDeposited = (users[uId].totalDeposited || 0) + amount;
                    checkReferralMilestones(uId);
                    saveData();
                    
                    addLog(`Заправка: ${users[uId].n} +${unitsAdded} Units`);
                    await sendTgMessage(uId, `⛽ БАК ЗАПРАВЛЕН!\nВы получили ${unitsAdded} Units за перевод ${amount} TON.`);
                    await sendTgMessage(ADMIN_ID, `💰 ДЕПОЗИТ: +${amount} TON от ${users[uId].n}. Начислено ${unitsAdded} Units.`);
                }
            }
            // СЦЕНАРИЙ Б: ПРЯМАЯ ПОКУПКА ТОВАРА (SHOP)
            else if (memo.startsWith('FISH_')) {
                const parts = memo.split('_');
                const uId = parts[1];
                const itemId = parts[2];

                if (users[uId] && PRICES_TON[itemId] <= (amount + 0.01)) {
                    applyItem(users[uId], itemId);
                    checkReferralMilestones(uId);
                    saveData();
                    
                    addLog(`Продажа: ${users[uId].n} -> ${itemId}`);
                    await sendTgMessage(uId, `✅ ПОКУПКА ПОДТВЕРЖДЕНА!\nТовар: ${itemId} активирован.`);
                    await sendTgMessage(ADMIN_ID, `🛍️ КАССА: ${users[uId].n} купил ${itemId} за ${amount} TON.`);
                }
            }
            
            // Фиксация хэша в базе (ровно один раз на транзакцию)
            processedTxs.push(hash);
            
            // Ограничение размера массива хэшей для экономии памяти
            if (processedTxs.length > 1000) processedTxs.shift();
        }
    } catch (e) { 
        console.error("Ошибка сканера TON (Критическая):", e.message); 
    } finally {
        isChecking = false;
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
            // Миграция старого поля в units (backward compatibility)
            Object.values(users).forEach((u) => {
                if (u.units === undefined) u.units = u.nf || 0;
                delete u.nf;
            });
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

function getTopPlayers() {
    return Object.values(users)
        .filter((p) => p && p.id !== ADMIN_ID && !p.isAdmin && (p.units || 0) > 0 && !p.isBanned)
        .sort((a, b) => (b.units || 0) - (a.units || 0))
        .slice(0, 10)
        .map((p) => ({
            username: p.n || "Рыбак",
            units: p.units || 0
        }));
}

function checkReferralMilestones(uId) {
    const u = users[uId];
    if (!u || !u.referrer || !users[u.referrer]) return false;
    const inviter = users[u.referrer];
    if (!Array.isArray(inviter.verifiedRefs)) inviter.verifiedRefs = [];

    const totalUnitsFlow = (u.unitsEarned || 0) + (u.unitsSpent || 0);
    const isMature = (u.totalDeposited || 0) > 0 || (u.fishCaught || 0) >= 100 || totalUnitsFlow > 10;
    if (!isMature) return false;
    if (inviter.verifiedRefs.includes(uId)) return false;

    inviter.verifiedRefs.push(uId);
    addLog(`Реферал подтвержден: ${u.n} -> ${inviter.n}`);
    return true;
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
    
    // Пакетная заправка Units
    if (item === 'nitro_refuel_1') u.units = (u.units || 0) + 10;
    if (item === 'nitro_refuel_5') u.units = (u.units || 0) + 50;

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
        const referrerId = payload?.referrerId;
        const canAttachReferrer = Boolean(referrerId && referrerId !== userId && users[referrerId]);
        users[userId] = {
            id: userId,
            n: userName || "Рыбак",
            b: 150,
            units: 0,
            unitsEarned: 0,
            unitsSpent: 0,
            totalDeposited: 0,
            fishCaught: 0,
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
            referrer: canAttachReferrer ? referrerId : null,
            referralsCount: 0,
            verifiedRefs: [],
            openedBoxes: 0,
            isBanned: false,
            isAdmin: (userId === ADMIN_ID)
        };
        if (canAttachReferrer) {
            users[referrerId].referralsCount = (users[referrerId].referralsCount || 0) + 1;
        }
        addLog(`Новый игрок: ${users[userId].n}`);
    }

    const u = users[userId];
    if (u.isBanned) return res.status(403).json({ error: "BANNED_BY_ADMIN" });

    // Обработка отсутствующих полей (совместимость версий)
    if (u.units === undefined) u.units = (u.nf || 0);
    delete u.nf;
    if (u.unitsEarned === undefined) u.unitsEarned = 0;
    if (u.unitsSpent === undefined) u.unitsSpent = 0;
    if (u.totalDeposited === undefined) u.totalDeposited = 0;
    if (u.fishCaught === undefined) u.fishCaught = 0;
    if (u.referralsCount === undefined) u.referralsCount = 0;
    if (u.referrer === undefined) u.referrer = null;
    if (!Array.isArray(u.verifiedRefs)) u.verifiedRefs = [];
    if (u.openedBoxes === undefined) u.openedBoxes = 0;
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
    let boxReward = null;

    // --- ОБРАБОТКА ДЕЙСТВИЙ ---
    switch (action) {
        
        case 'load':
        case 'init':
            checkReferralMilestones(userId);
            msg = "Данные синхронизированы"; 
            break;

        case 'get_top':
            return res.json({
                topPlayers: getTopPlayers(),
                msg: "TOP_OK"
            });

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
                u.fishCaught += weight;
                u.xp += (isVip ? 10 : 5);
                checkLevelUp(u);
                catchData = { 
                    type: "Рыба (TURBO-SELL)", 
                    w: `${weight.toFixed(2)} кг -> +${instantCash} TC` 
                };
            } else {
                u.fish += weight;
                u.fishCaught += weight;
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

        case 'spin_fortune':
            // КРУТКА КОЛЕСА ФОРТУНЫ ЗА 2 Units
            if (u.units < 2) { 
                msg = "ОШИБКА: НУЖНО ТОПЛИВО (2 Units)!"; 
                break; 
            }
            u.units -= 2;
            u.unitsSpent += 2;
            const prize = spinFortuneWheel(u);
            if (prize.includes("+4 Units")) u.unitsEarned += 4;
            if (prize.includes("+20 Units")) u.unitsEarned += 20;
            checkReferralMilestones(userId);
            msg = `🎡 FORTUNE-РЕЗУЛЬТАТ: ${prize}`;
            saveData();
            break;

        case 'open_box': {
            const available = (u.verifiedRefs?.length || 0) - (u.openedBoxes || 0);
            if (available <= 0) {
                msg = "КОРОБОК НЕТ";
                break;
            }
            const rewards = [3, 5, 10];
            const unitsWin = rewards[Math.floor(Math.random() * rewards.length)];
            u.units = (u.units || 0) + unitsWin;
            u.unitsEarned = (u.unitsEarned || 0) + unitsWin;
            u.openedBoxes = (u.openedBoxes || 0) + 1;
            boxReward = { n: `+${unitsWin} UNITS` };
            msg = `ЗОЛОТАЯ КОРОБКА: +${unitsWin} Units`;
            saveData();
            break;
        }

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
                if (payload.op === 'add_nf') target.units = (target.units || 0) + parseInt(payload.val);
                if (payload.op === 'add_units') target.units = (target.units || 0) + parseInt(payload.val);
                if (payload.op === 'ban') target.isBanned = !target.isBanned;
                msg = "АДМИН: ДЕЙСТВИЕ ВЫПОЛНЕНО!";
            }
            break;

        case 'admin_god_op':
            if (userId !== ADMIN_ID) return res.status(403).json({ error: "ADMIN_ONLY" });
            if (payload.op === 'add_units') {
                u.units = (u.units || 0) + 100;
                msg = "GOD MODE: +100 Units";
            } else if (payload.op === 'refill_energy') {
                const cap = isVip ? 100 : 50;
                u.energy = cap;
                msg = "GOD MODE: Energy refilled";
            } else if (payload.op === 'broadcast') {
                const text = (payload.text || '').trim();
                if (!text) {
                    msg = "GOD MODE: Пустой текст рассылки";
                } else {
                    const allIds = Object.keys(users);
                    await Promise.allSettled(allIds.map((id) => sendTgMessage(id, `📣 [ADMIN]\n${text}`)));
                    msg = `GOD MODE: Broadcast отправлен (${allIds.length})`;
                }
            } else {
                msg = "GOD MODE: Неизвестная операция";
            }
            break;
    }
    
    saveData();
    // Ответ клиенту
    res.json({ 
        ...u, 
        jackpot, 
        events: serverEvents, 
        msg, 
        catchData,
        boxReward
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

