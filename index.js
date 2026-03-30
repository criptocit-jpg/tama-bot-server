/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 7.5.0 "MAXIMUM MEAT EDITION"
 * [AUTHOR]: GEMINI & THE MASTER
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
app.use(express.static(__dirname)); // Раздача файлов (html, css, js)

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'users.json');

// --------------------------------------------------------------------------
// [1] КОНФИГУРАЦИЯ (TON & TELEGRAM)
// --------------------------------------------------------------------------
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const MY_TON_WALLET = 'UQAQZE0WB6mmLAAq0XCTlipocPlrqopaxHgXFmOmp-fCFBJh';
const TONCENTER_API_KEY = '360540e7a910fec0124ef783d85d607d0963e0c26d204b49d3500fc452be5c15';

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
// [2] ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// --------------------------------------------------------------------------
let users = {};
let processedTxs = []; 
let logs = ["Сервер 7.5.0: МОНОЛИТ ЗАПУЩЕН 🚀"];
let serverEvents = ["Система: Ожидание транзакций TON", "Экономика: Стабильна"];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { weeklyCarpCaught: 0, lastReset: Date.now() };

const SELL_PRICE = 2; 
const TAX_RATE = 0.05; 

// --------------------------------------------------------------------------
// [3] БАЗА ДАННЫХ (STORAGE ENGINE)
// --------------------------------------------------------------------------
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            processedTxs = data.processedTxs || [];
            jackpot = data.jackpot || { pool: 1000, lastWinner: "Никто" };
            globalState = data.globalState || { weeklyCarpCaught: 0, lastReset: Date.now() };
            console.log("База загружена. Юзеров:", Object.keys(users).length);
        } catch(e) { console.error("Ошибка парсинга JSON:", e); }
    }
}

function saveData() { 
    try {
        const dataToSave = { users, processedTxs, jackpot, globalState, lastSave: Date.now(), version: "7.5.0" };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
    } catch (e) { console.error("Ошибка записи файла:", e); }
}

loadData();

function addLog(m) {
    const time = new Date().toLocaleString();
    logs.unshift(`[${time}] ${m}`);
    if(logs.length > 50) logs.pop();
    console.log(m);
}

// --------------------------------------------------------------------------
// [4] СИСТЕМА УРОВНЕЙ И ТЕЛЕГРАМ
// --------------------------------------------------------------------------
async function sendTgMessage(chatId, text) {
    try { await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: text, parse_mode: 'HTML' }); } 
    catch (e) { console.error("TG ERR:", e.message); }
}

function checkLevelUp(u) {
    const nextLevelXP = u.level * 500; 
    if (u.xp >= nextLevelXP) {
        u.xp -= nextLevelXP;
        u.level += 1;
        sendTgMessage(u.id, `🏆 <b>УРОВЕНЬ ПОВЫШЕН!</b>\nВаш уровень: ${u.level}`);
        return true;
    }
    return false;
}

// --------------------------------------------------------------------------
// [5] СКАНЕР TON (АВТОМАТИЧЕСКИЕ ПЛАТЕЖИ)
// --------------------------------------------------------------------------
async function checkTonPayments() {
    try {
        const url = `https://toncenter.com/api/v2/getTransactions?address=${MY_TON_WALLET}&limit=15`;
        const res = await axios.get(url, { headers: { 'X-API-Key': TONCENTER_API_KEY } });
        if (!res.data || !res.data.ok) return;

        for (const tx of res.data.result) {
            const hash = tx.transaction_id.hash;
            if (processedTxs.includes(hash)) continue;

            const inMsg = tx.in_msg;
            if (!inMsg || !inMsg.message) { processedTxs.push(hash); continue; }

            const memo = inMsg.message; 
            const amount = parseFloat(inMsg.value) / 1e9;

            if (memo.includes('_DEPOSIT') || memo.includes('_RECHARGE')) {
                const uId = memo.split('_')[1];
                if (users[uId]) {
                    const nfAdded = Math.floor(amount * 10);
                    users[uId].nf = (users[uId].nf || 0) + nfAdded;
                    addLog(`[PAY] Игрок ${users[uId].n} +${nfAdded} NF`);
                    sendTgMessage(uId, `⛽ <b>ЗАПРАВКА УСПЕШНА!</b>\nБаланс: +${nfAdded} NF`);
                }
            } else if (memo.startsWith('FISH_')) {
                const parts = memo.split('_');
                const uId = parts[1];
                const itemId = parts[2];
                if (users[uId] && (PRICES_TON[itemId] <= (amount + 0.01))) {
                    applyItem(users[uId], itemId);
                    sendTgMessage(uId, `✅ <b>ТОВАР АКТИВИРОВАН!</b>\nВы купили: ${itemId}`);
                }
            }
            processedTxs.push(hash);
            if (processedTxs.length > 1000) processedTxs.shift();
        }
        saveData();
    } catch (e) { /* Игнорируем ошибки сети */ }
}
setInterval(checkTonPayments, 45000);

function applyItem(u, item) {
    const now = Date.now();
    const week = 7 * 24 * 3600 * 1000;
    if (item === 'vip_bait') u.buffs.bait = Math.max(now, u.buffs.bait || 0) + week;
    if (item === 'titan_rod_7') u.buffs.titan = Math.max(now, u.buffs.titan || 0) + week;
    if (item === 'hope_lake_7') u.buffs.hope = Math.max(now, u.buffs.hope || 0) + week;
    if (item === 'vip_status_14') u.buffs.vip = Math.max(now, u.buffs.vip || 0) + (week * 2);
    if (item === 'energy_boost') u.energy = 100;
    if (item === 'nitro_refuel_1') u.nf = (u.nf || 0) + 10;
}

// --------------------------------------------------------------------------
// [6] API ОБРАБОТЧИК (ОСНОВНАЯ ЛОГИКА)
// --------------------------------------------------------------------------
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "Missing ID" });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 200, nf: 0, fish: 0, energy: 50, dur: 100, level: 1, xp: 0,
            lastBonus: 0, lastUpdate: now, buffs: { titan: 0, vip: 0, bait: 0, hope: 0 },
            stats: { boxes: 0 }, isBanned: false, isAdmin: (userId.toString() === ADMIN_ID)
        };
        addLog(`Новый игрок: ${userName}`);
    }

    const u = users[userId];
    if (u.isBanned) return res.status(403).json({ error: "BANNED" });

    // Энергия
    const isVip = u.buffs.vip > now;
    if (isVip) { u.energy = 100; } else {
        const passed = now - u.lastUpdate;
        if (passed > 300000) { u.energy = Math.min(50, u.energy + Math.floor(passed / 300000) * 5); u.lastUpdate = now; }
    }

    let resp = { success: true, msg: "" };

    switch (action) {
        case 'load': 
            resp.msg = "OK"; 
            break;

        case 'cast':
            if (u.energy < 2 && !isVip) { resp.msg = "НЕТ ЭНЕРГИИ"; break; }
            if (u.dur <= 0 && u.buffs.titan < now) { resp.msg = "УДОЧКА СЛОМАНА"; break; }
            
            if (!isVip) u.energy -= 2;
            if (u.buffs.titan < now) u.dur -= 1;

            let w = (Math.random() * 2.0 + 0.3);
            if (u.buffs.bait > now) w *= 3;
            
            u.fish += w;
            u.xp += 15;
            checkLevelUp(u);
            resp.catch = { weight: w.toFixed(2), type: "Обычная рыба" };
            break;

        case 'sell':
            if (u.fish <= 0) { resp.msg = "ПУСТО"; break; }
            const money = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(money * TAX_RATE);
            u.b += (money - tax);
            u.fish = 0;
            jackpot.pool += tax;
            resp.msg = `ПРОДАНО: ${money - tax} TC`;
            break;

        case 'spin':
            const cost = payload.type === 'unit' ? 2 : 200;
            if (payload.type === 'unit' ? u.nf < 2 : u.b < 200) { resp.msg = "МАЛО СРЕДСТВ"; break; }
            if (payload.type === 'unit') u.nf -= 2; else u.b -= 200;
            
            // Математика выигрыша (для синхронизации с клиентом)
            u.b += 100; 
            resp.msg = "Выигрыш зачислен!";
            break;

        case 'admin_get_all':
            if (u.isAdmin) resp.allData = { users: Object.values(users), logs, jackpot };
            break;
            
        case 'admin_op':
            if (u.isAdmin && payload.targetId) {
                const target = users[payload.targetId];
                if (payload.op === 'money') target.b += parseInt(payload.val);
                if (payload.op === 'nf') target.nf += parseInt(payload.val);
                if (payload.op === 'ban') target.isBanned = !target.isBanned;
                saveData();
            }
            break;
    }

    saveData();
    res.json({ ...u, ...resp, jackpot, units: u.nf });
});

app.listen(PORT, () => console.log(`🚀 MONOLITH 7.5.0 ONLINE`));
