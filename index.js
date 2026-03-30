/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 7.0.0 "STABLE MONOLITH"
 * [STATUS]: СТАБИЛИЗИРОВАНО GEMINI
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

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const MY_TON_WALLET = 'UQAQZE0WB6mmLAAq0XCTlipocPlrqopaxHgXFmOmp-fCFBJh';
const TONCENTER_API_KEY = '360540e7a910fec0124ef783d85d607d0963e0c26d204b49d3500fc452be5c15';

const PRICES_TON = {
    'vip_bait': 1.0, 'titan_rod_7': 1.0, 'hope_lake_7': 2.0, 'vip_status_14': 3.0,
    'myakish_100': 0.5, 'energy_boost': 0.2, 'nitro_refuel_1': 1.0, 'nitro_refuel_5': 5.0,
    'turbo_license': 5.0
};

// --- ХРАНИЛИЩЕ ---
let users = {};
let processedTxs = []; 
let logs = ["СИСТЕМА 7.0.0: ЗАПУСК МОНОЛИТА..."];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { totalCaught: 0, lastReset: Date.now() };

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function addLog(m) {
    const logMsg = `[${new Date().toLocaleTimeString()}] ${m}`;
    logs.unshift(logMsg);
    if(logs.length > 100) logs.pop();
    console.log(logMsg);
}

function saveData() { 
    try {
        const data = { users, processedTxs, jackpot, globalState, lastSave: Date.now() };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); 
    } catch (e) { console.error("ОШИБКА ЗАПИСИ:", e); }
}

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            users = data.users || {};
            processedTxs = data.processedTxs || [];
            jackpot = data.jackpot || { pool: 1000, lastWinner: "Никто" };
            globalState = data.globalState || { totalCaught: 0, lastReset: Date.now() };
            addLog("БАЗА ДАННЫХ ЗАГРУЖЕНА УСПЕШНО");
        } catch(e) { addLog("КРИТИЧЕСКАЯ ОШИБКА ЧТЕНИЯ БАЗЫ!"); }
    }
}
loadData();

// --- ТЕЛЕГРАМ УВЕДОМЛЕНИЯ ---
async function sendTg(chatId, text) {
    try { await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: text, parse_mode: 'HTML' }); } 
    catch (e) { console.error("TG ERR:", e.message); }
}

// --- СКАНЕР ПЛАТЕЖЕЙ TON ---
async function scanTon() {
    try {
        const url = `https://toncenter.com/api/v2/getTransactions?address=${MY_TON_WALLET}&limit=10`;
        const res = await axios.get(url, { headers: { 'X-API-Key': TONCENTER_API_KEY } });
        if (!res.data || !res.data.ok) return;

        for (const tx of res.data.result) {
            const hash = tx.transaction_id.hash;
            if (processedTxs.includes(hash)) continue;

            const msg = tx.in_msg.message || "";
            const val = parseFloat(tx.in_msg.value) / 1e9;

            if (msg.includes('_DEPOSIT_')) {
                const uId = msg.split('_DEPOSIT_')[1];
                if (users[uId]) {
                    const nf = Math.floor(val * 10);
                    users[uId].nf += nf;
                    addLog(`ПОПОЛНЕНИЕ: ${users[uId].n} +${nf} NF`);
                    sendTg(uId, `⛽ <b>Nitro Fuel пополнен!</b>\nЗачислено: ${nf} NF`);
                }
            } else if (msg.startsWith('FISH_')) {
                const [_, uId, item] = msg.split('_');
                if (users[uId] && PRICES_TON[item] <= val + 0.01) {
                    applyItem(users[uId], item);
                    addLog(`МАГАЗИН: ${users[uId].n} купил ${item}`);
                    sendTg(uId, `✅ <b>Покупка успешна!</b>\nАктивировано: ${item}`);
                }
            }
            processedTxs.push(hash);
            if(processedTxs.length > 500) processedTxs.shift();
        }
        saveData();
    } catch (e) { console.log("SCANNER IDLE..."); }
}
setInterval(scanTon, 30000);

function applyItem(u, item) {
    const now = Date.now();
    const week = 7 * 24 * 3600 * 1000;
    if (item === 'vip_bait') u.buffs.bait = Math.max(now, u.buffs.bait) + week;
    if (item === 'titan_rod_7') u.buffs.titan = Math.max(now, u.buffs.titan) + week;
    if (item === 'vip_status_14') u.buffs.vip = Math.max(now, u.buffs.vip) + (week * 2);
    if (item === 'turbo_license') u.isTurbo = true;
    if (item === 'energy_boost') u.energy = 100;
}

// --- ЯДРО УДАЧИ (КОЛЕСО) ---
function spinWheel(u, type) {
    const cost = type === 'unit' ? 2 : 100;
    if (type === 'unit' ? u.nf < 2 : u.b < 100) return { error: "НЕДОСТАТОЧНО СРЕДСТВ" };
    
    if (type === 'unit') u.nf -= 2; else u.b -= 100;

    const rnd = Math.random() * 100;
    let res = { index: 3, prize: "ПУСТО", val: 0 };

    if (rnd < 40) res = { index: 3, prize: "ПУСТО", val: 0 };
    else if (rnd < 70) { res = { index: 4, prize: "100 TC", val: 100 }; u.b += 100; }
    else if (rnd < 85) { res = { index: 6, prize: "200 TC", val: 200 }; u.b += 200; }
    else if (rnd < 95) { res = { index: 2, prize: "500 TC", val: 500 }; u.b += 500; }
    else { res = { index: 7, prize: "20 NF", val: 20 }; u.nf += 20; jackpot.lastWinner = u.n; }

    return res;
}

// --- API ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 200, nf: 0, fish: 0, energy: 50, dur: 100, level: 1, xp: 0,
            isTurbo: false, lastBonus: 0, lastUpdate: now, buffs: { titan: 0, vip: 0, bait: 0 },
            isBanned: false, isAdmin: (userId.toString() === ADMIN_ID)
        };
        addLog(`НОВЫЙ ИГРОК: ${users[userId].n}`);
    }

    const u = users[userId];
    if (u.isBanned) return res.status(403).json({ error: "BANNED" });

    // Регенерация энергии (5 ед в 5 мин)
    const passed = now - u.lastUpdate;
    if (passed > 300000 && u.energy < 50 && u.buffs.vip < now) {
        u.energy = Math.min(50, u.energy + Math.floor(passed / 300000) * 5);
        u.lastUpdate = now;
    }
    if (u.buffs.vip > now) u.energy = 100;

    let response = { success: true, msg: "" };

    switch (action) {
        case 'cast':
            if (u.energy < 2 && u.buffs.vip < now) { response.msg = "НЕТ ЭНЕРГИИ!"; break; }
            if (u.dur <= 0 && u.buffs.titan < now) { response.msg = "УДОЧКА СЛОМАНА!"; break; }
            
            if (u.buffs.vip < now) u.energy -= 2;
            if (u.buffs.titan < now) u.dur -= 2;

            let w = (Math.random() * 2 + 0.5);
            if (u.buffs.bait > now) w *= 3;
            
            u.fish += w;
            u.xp += 5;
            if (u.xp >= u.level * 500) { u.level++; u.xp = 0; sendTg(u.id, "🎊 НОВЫЙ УРОВЕНЬ!"); }
            
            response.catch = { weight: w.toFixed(2), type: "Обычная рыба" };
            break;

        case 'sell':
            if (u.fish <= 0) { response.msg = "САДОК ПУСТ"; break; }
            const money = Math.floor(u.fish * 2);
            u.b += money;
            u.fish = 0;
            response.msg = `ПРОДАНО ЗА ${money} TC`;
            break;

        case 'spin':
            const wheelRes = spinWheel(u, payload.type);
            if (wheelRes.error) { response.msg = wheelRes.error; } 
            else { response.wheel = wheelRes; }
            break;

        case 'admin_full':
            if (u.isAdmin) response.adminData = { users: Object.values(users), logs, jackpot };
            break;
    }

    saveData();
    res.json({ ...u, ...response, jackpot });
});

app.listen(PORT, () => console.log(`--- MONOLITH 7.0.0 READY ON PORT ${PORT} ---`));
