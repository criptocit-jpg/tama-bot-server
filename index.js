/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 7.0.5 "STABLE CORE"
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

// ВАЖНО: Раздаем статику (html, js, css), чтобы Render не показывал код
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'users.json');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 
const MY_TON_WALLET = 'UQAQZE0WB6mmLAAq0XCTlipocPlrqopaxHgXFmOmp-fCFBJh';
const TONCENTER_API_KEY = '360540e7a910fec0124ef783d85d607d0963e0c26d204b49d3500fc452be5c15';

// --- БАЗА ДАННЫХ ---
let users = {};
let processedTxs = [];
let jackpot = { pool: 1000, lastWinner: "Никто" };

function saveData() { 
    try {
        const data = { users, processedTxs, jackpot, lastSave: Date.now() };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); 
    } catch (e) { console.error("ERR SAVE:", e); }
}

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            users = data.users || {};
            processedTxs = data.processedTxs || [];
            jackpot = data.jackpot || { pool: 1000, lastWinner: "Никто" };
        } catch(e) { console.error("ERR LOAD"); }
    }
}
loadData();

// --- СТАТИЧЕСКИЙ РОУТ (Чтобы открывалась игра) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API ОБРАБОТЧИК ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();

    if (!userId) return res.status(400).json({ error: "No ID" });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 200, nf: 0, fish: 0, energy: 50, dur: 100, level: 1, xp: 0,
            lastBonus: 0, lastUpdate: now, buffs: { titan: 0, vip: 0, hope: 0 },
            isAdmin: (userId.toString() === ADMIN_ID)
        };
    }

    const u = users[userId];
    let resp = { success: true, msg: "" };

    switch (action) {
        case 'load': 
            resp.msg = "Данные загружены"; 
            break;

        case 'cast':
            if (u.energy < 2 && u.buffs.vip < now) { resp.msg = "НЕТ ЭНЕРГИИ!"; break; }
            if (u.dur <= 0 && u.buffs.titan < now) { resp.msg = "УДОЧКА СЛОМАНА!"; break; }
            
            if (u.buffs.vip < now) u.energy -= 2;
            if (u.buffs.titan < now) u.dur -= 1;

            let weight = (Math.random() * 2.0 + 0.3);
            u.fish += weight;
            u.xp += 10;
            if (u.xp >= u.level * 500) { u.level++; u.xp = 0; }
            
            resp.catch = { weight: weight.toFixed(2), type: "Обычная рыба" };
            break;

        case 'sell':
            if (u.fish <= 0) { resp.msg = "САДОК ПУСТ!"; break; }
            const income = Math.floor(u.fish * 2);
            u.b += income;
            u.fish = 0;
            resp.msg = `ПРОДАНО ЗА ${income} TC`;
            break;

        case 'spin':
            const isUnits = (payload.type === 'unit');
            if (isUnits ? u.nf < 2 : u.b < 200) { resp.msg = "Недостаточно средств!"; break; }
            
            if (isUnits) u.nf -= 2; else u.b -= 200;
            // Упрощенная логика колеса на сервере
            u.b += 100; 
            resp.msg = "Вы выиграли 100 TC!";
            break;
    }

    saveData();
    res.json({ ...u, ...resp, jackpot });
});

app.listen(PORT, () => console.log(`🚀 MONOLITH 7.0.5 READY`));
