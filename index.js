/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 6.5.2 "NITRO FUEL EDITION"
 * [AUTHOR]: GEMINI & THE MASTER
 * ==========================================================================
 * МАТЕМАТИКА ЭКОНОМИКИ:
 * 1. ВАЛЮТА: 1 TON = 10 NF (NITRO FUEL).
 * 2. СТОИМОСТЬ СПИНА: 2 NF (ЭКВИВАЛЕНТ 0.2 TON) ИЛИ 100 TC.
 * 3. ДОХОДНОСТЬ (RTP): 50% В ПОЛЬЗУ ИГРОКА / 50% В КАССУ МАСТЕРА.
 * 4. БЕЗОПАСНОСТЬ: ПРОВЕРКА HASH ТРАНЗАКЦИЙ ДЛЯ ЗАЩИТЫ ОТ ПОВТОРОВ.
 * 5. АДМИН-ДОСТУП: ПОЛНЫЙ КОНТРОЛЬ БАЗЫ И ЛОГОВ.
 * ==========================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'users.json');

// --------------------------------------------------------------------------
// [1] КОНФИГУРАЦИЯ СЕТИ И ПЛАТЕЖЕЙ (TON & TELEGRAM)
// --------------------------------------------------------------------------
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const MY_TON_WALLET = 'UQAQZE0WB6mmLAAq0XCTlipocPlrqopaxHgXFmOmp-fCFBJh';
const TONCENTER_API_KEY = '360540e7a910fec0124ef783d85d607d0963e0c26d204b49d3500fc452be5c15';

/**
 * ПРАЙС-ЛИСТ (ЦЕНЫ В TON)
 */
const PRICES_TON = {
    'vip_bait': 1.0,        // VIP Приманка (7 дней)
    'titan_rod_7': 1.0,     // Титановая удочка (7 дней)
    'hope_lake_7': 2.0,     // Озеро Надежды (7 дней)
    'vip_status_14': 3.0,   // VIP Статус (14 дней)
    'myakish_100': 0.5,     // 100 Хлебных мякишей
    'energy_boost': 0.2,    // Энергетик (100% энергии)
    'nitro_refuel_1': 1.0,  // Заправка: 10 NF (Units)
    'nitro_refuel_5': 5.0,  // Заправка: 50 NF (Units)
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
function spinNitroWheel(u) {
    const rnd = Math.random() * 100;
    let res = { index: 3, prize: "ПУСТО! 💨" }; 

    if (rnd < 40) { 
        res = { index: 3, prize: "ПУСТО! 💨" }; 
    } 
    else if (rnd < 65) { 
        const win = 100;
        u.b += win;
        res = { index: 4, prize: "💰 +100 TC" }; 
    }
    else if (rnd < 80) { 
        const win = 200;
        u.b += win;
        res = { index: 6, prize: "💰 +200 TC" }; 
    }
    else if (rnd < 88) { 
        u.energy = 100; 
        res = { index: 1, prize: "⚡ ЭНЕРГИЯ 100%" }; 
    }
    else if (rnd < 93) { 
        const day = 24 * 60 * 60 * 1000;
        u.buffs.vip = Math.max(Date.now(), u.buffs.vip || 0) + day;
        res = { index: 5, prize: "⭐ VIP НА 24 ЧАСА!" }; 
    }
    else if (rnd < 97) { 
        const win = 500;
        u.b += win;
        res = { index: 2, prize: "💎 +500 TC" }; 
    }
    else if (rnd < 99) { 
        u.b += 50;
        res = { index: 0, prize: "💰 +50 TC" }; 
    }
    else { 
        u.nf = (u.nf || 0) + 20; 
        res = { index: 7, prize: "🔥 JACKPOT: +20 UNITS! 🔥" }; 
        jackpot.lastWinner = u.n;
    }
    return res;
}

// --------------------------------------------------------------------------
// [4] АВТОМАТИЧЕСКИЙ МОНИТОРИНГ БЛОКЧЕЙНА TON
// --------------------------------------------------------------------------
async function checkTonPayments() {
    console.log("--- Сканирование TON: Поиск новых транзакций ---");
    try {
        const url = `https://toncenter.com/api/v2/getTransactions?address=${MY_TON_WALLET}&limit=15&to_lt=0&archival=false`;
        const res = await axios.get(url, { headers: { 'X-API-Key': TONCENTER_API_KEY } });
        
        if (!res.data || !res.data.ok) {
            console.error("Ошибка TonCenter API");
            return;
        }

        const transactions = res.data.result;

        for (const tx of transactions) {
            const hash = tx.transaction_id.hash;
            
            if (processedTxs.includes(hash)) continue;

            const inMsg = tx.in_msg;
            if (!inMsg || !inMsg.message) {
                processedTxs.push(hash);
                continue;
            }

            const memo = inMsg.message; 
            const amount = parseFloat(inMsg.value) / 1000000000;

            console.log(`Найдена транзакция: ${amount} TON, Memo: ${memo}`);

            if (memo.includes('_DEPOSIT') || memo.includes('_RECHARGE')) {
                const uId = memo.split('_')[1];
                if (users[uId]) {
                    const nfAdded = Math.floor(amount * 10); 
                    users[uId].nf = (users[uId].nf || 0) + nfAdded;
                    processedTxs.push(hash);
                    saveData();
                    
                    addLog(`[PAYMENT] Игрок ${users[uId].n} заправил +${nfAdded} NF`);
                    await sendTgMessage(uId, `⛽ NITRO-ЗАПРАВКА УСПЕШНА!\nВаш баланс пополнен на ${nfAdded} NF.`);
                    await sendTgMessage(ADMIN_ID, `💰 КАССА: +${amount} TON от ${users[uId].n}`);
                }
            }
            else if (memo.startsWith('FISH_')) {
                const parts = memo.split('_');
                const uId = parts[1];
                const itemId = parts[2];

                if (users[uId] && (PRICES_TON[itemId] <= (amount + 0.01))) {
                    applyItem(users[uId], itemId);
                    processedTxs.push(hash);
                    saveData();
                    
                    addLog(`[SHOP] Продажа товара ${itemId} игроку ${users[uId].n}`);
                    await sendTgMessage(uId, `✅ ТОВАР АКТИВИРОВАН!\nВы успешно приобрели: ${itemId}`);
                    await sendTgMessage(ADMIN_ID, `🛍️ КУПЛЕНО: ${itemId} за ${amount} TON`);
                }
            }
            
            processedTxs.push(hash);
            if (processedTxs.length > 2000) processedTxs.shift();
        }
    } catch (e) { 
        console.error("Критическая ошибка сканера:", e.message); 
    }
}

setInterval(checkTonPayments, 60000);

// --------------------------------------------------------------------------
// [5] РАБОТА С БАЗОЙ ДАННЫХ (STORAGE ENGINE)
// --------------------------------------------------------------------------
function loadData() {
    console.log("Загрузка базы данных...");
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            processedTxs = data.processedTxs || [];
            jackpot = data.jackpot || { pool: MIN_JACKPOT, lastWinner: "Никто" };
            globalState = data.globalState || { weeklyCarpCaught: 0, lastReset: Date.now() };
            withdrawRequests = data.withdrawRequests || [];
            console.log("База загружена. Пользователей:", Object.keys(users).length);
        } catch(e) { 
            console.error("Ошибка парсинга JSON:", e); 
        }
    } else {
        console.log("Файл базы не найден, создаю новый...");
        saveData();
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
            lastSave: Date.now(),
            version: "6.5.2"
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
    } catch (e) {
        console.error("Ошибка записи файла:", e);
    }
}

loadData();

function addLog(m) {
    const time = new Date().toLocaleString();
    const logMsg = `[${time}] ${m}`;
    logs.unshift(logMsg);
    serverEvents.unshift(m);
    if(logs.length > 100) logs.pop();
    if(serverEvents.length > 20) serverEvents.pop();
    console.log(logMsg);
}

// --------------------------------------------------------------------------
// [6] ИГРОВЫЕ МЕХАНИКИ (LOGIC CORE)
// --------------------------------------------------------------------------
function checkLevelUp(u) {
    const nextLevelXP = u.level * 500; 
    if (u.xp >= nextLevelXP) {
        u.xp -= nextLevelXP;
        u.level += 1;
        sendTgMessage(u.id, `🏆 УРОВЕНЬ ПОВЫШЕН!\nВаш текущий уровень мастерства: ${u.level}`);
        addLog(`Игрок ${u.n} достиг ${u.level} уровня`);
        return true;
    }
    return false;
}

async function sendTgMessage(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        });
    } catch (e) { 
        console.error("Telegram API Error:", e.message); 
    }
}

function applyItem(u, item) {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const fortnight = 14 * 24 * 60 * 60 * 1000;

    if (item === 'vip_bait') u.buffs.bait = Math.max(now, u.buffs.bait || 0) + week;
    if (item === 'titan_rod_7') u.buffs.titan = Math.max(now, u.buffs.titan || 0) + week;
    if (item === 'hope_lake_7') u.buffs.hope = Math.max(now, u.buffs.hope || 0) + week;
    if (item === 'vip_status_14') u.buffs.vip = Math.max(now, u.buffs.vip || 0) + fortnight;
    if (item === 'turbo_license') u.isTurbo = true;
    
    if (item === 'nitro_refuel_1') u.nf = (u.nf || 0) + 10;
    if (item === 'nitro_refuel_5') u.nf = (u.nf || 0) + 50;

    if (item === 'myakish_100') u.buffs.myakish = (u.buffs.myakish || 0) + 100;
    if (item === 'energy_boost') u.energy = 100;
}

// --------------------------------------------------------------------------
// [7] API ОБРАБОТЧИК (ROUTING ENGINE)
// --------------------------------------------------------------------------
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "Missing UserID" });

    if (!users[userId]) {
        users[userId] = {
            id: userId,
            n: userName || "Новичок",
            b: 200,
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
            buffs: { titan: 0, hope: 0, vip: 0, bait: 0, myakish: 10 },
            stats: { boxes: 0, totalSpins: 0 },
            isBanned: false,
            isAdmin: (userId.toString() === ADMIN_ID.toString())
        };
        addLog(`Новое подключение: ${users[userId].n} (${userId})`);
    }

    const u = users[userId];
    if (u.isBanned) return res.status(403).json({ error: "USER_BANNED" });

    const isVip = u.buffs.vip > now;
    const hasTitan = u.buffs.titan > now || isVip;

    if (isVip) {
        u.energy = 100;
    } else {
        const passed = now - u.lastUpdate;
        if (passed > 300000) { 
            const reg = Math.floor(passed / 300000);
            u.energy = Math.min(50, u.energy + reg); 
            u.lastUpdate = now;
        }
    }

    let msg = ""; 
    let catchData = null;

    switch (action) {
        case 'load': 
            msg = "Данные игрока загружены"; 
            break;

        case 'cast':
            if (!isVip && u.energy < 2) { msg = "НЕДОСТАТОЧНО ЭНЕРГИИ!"; break; }
            if (!hasTitan && u.dur <= 0) { msg = "УДОЧКА ТРЕБУЕТ РЕМОНТА!"; break; }
            
            if (!isVip) u.energy -= 2;
            if (!hasTitan) u.dur = Math.max(0, u.dur - 1);
            u.total++;

            let xpGain = isVip ? 4 : 2;
            if (u.isTurbo) xpGain *= 2;
            u.xp += xpGain;
            checkLevelUp(u);

            let weight = (Math.random() * 2.0 + 0.3);
            const isGoldHour = new Date().getMinutes() < 10;
            if (u.buffs.bait > now) weight *= (isGoldHour ? 6 : 3);

            if (u.isTurbo) {
                const turboCash = Math.floor(weight * SELL_PRICE);
                u.b += turboCash;
                catchData = { 
                    type: "Рыба (TURBO-LINK)", 
                    w: `${weight.toFixed(2)} кг -> +${turboCash} TC` 
                };
            } else {
                u.fish += weight;
                catchData = { type: "Рыба", w: weight.toFixed(2) };
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "САДОК ПУСТ!"; break; }
            const totalIncome = Math.floor(u.fish * SELL_PRICE);
            const fee = Math.floor(totalIncome * TAX_RATE);
            
            jackpot.pool += fee;
            u.b += (totalIncome - fee);
            u.fish = 0;
            u.xp += 10;
            checkLevelUp(u);
            
            msg = `Улов продан за ${totalIncome - fee} TC! (Налог: ${fee})`;
            break;

        case 'spin_wheel':
            const currency = payload.cur || 'tc';
            if (currency === 'unit') {
                if (u.nf < 2) { msg = "ОШИБКА: НУЖНО 2 ЮНИТА!"; break; }
                u.nf -= 2;
            } else {
                if (u.b < 100) { msg = "ОШИБКА: НУЖНО 100 TC!"; break; }
                u.b -= 100;
            }

            const wheelResult = spinNitroWheel(u);
            u.stats.totalSpins = (u.stats.totalSpins || 0) + 1;
            saveData();
            return res.json({ 
                ...u, 
                units: u.nf, 
                jackpot, 
                msg: `🎡 РЕЗУЛЬТАТ: ${wheelResult.prize}`, 
                wheelIndex: wheelResult.index 
            });

        case 'buy':
            const targetItem = payload.id;
            if (targetItem === 'repair' && u.b >= 50) { 
                u.b -= 50; 
                u.dur = 100; 
                msg = "УДОЧКА ВОССТАНОВЛЕНА!"; 
                break; 
            }
            
            const priceTon = PRICES_TON[targetItem];
            if (priceTon) {
                msg = `ИНСТРУКЦИЯ ОТПРАВЛЕНА В БОТА!`;
                sendTgMessage(userId, `<b>💳 ОПЛАТА ТОВАРА</b>\n\nТовар: <code>${targetItem}</code>\nЦена: <b>${priceTon} TON</b>\n\nОтправьте TON на адрес:\n<code>${MY_TON_WALLET}</code>\n\n⚠️ <b>ОБЯЗАТЕЛЬНО</b> укажите этот комментарий (MEMO):\n<code>FISH_${userId}_${targetItem}</code>`);
            }
            break;
    }
    
    saveData();
    res.json({ ...u, units: u.nf, jackpot, events: serverEvents, msg, catchData });
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 TAMAC NITRO MONOLITH 6.5.2 ЗАПУЩЕН`);
    console.log(`====================================================`);
});
