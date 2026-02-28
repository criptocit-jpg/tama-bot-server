const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

// --- НАСТРОЙКИ ---
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_ID = '7883085758'; 

let users = {};
let logs = ["Сервер 4.2.1 запущен: Озеро Надежды активно!"];
let serverEvents = ["10 Золотых карпов ждут на Озере Надежды!", "VIP-магазин пополнен!"];
let jackpot = { pool: 1000, lastWinner: "Никто" };
let globalState = { weeklyCarpCaught: 0, lastReset: Date.now() };

const MIN_JACKPOT = 1000;
const SELL_PRICE = 2; // 1кг = 2 TC
const TAX_RATE = 0.05; // Налог 5%

// --- РАБОТА С ДАННЫМИ ---
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
            users = data.users || {};
            jackpot = data.jackpot || { pool: MIN_JACKPOT, lastWinner: "Никто" };
            globalState = data.globalState || { weeklyCarpCaught: 0, lastReset: Date.now() };
        } catch(e) { console.error("Ошибка загрузки:", e); }
    }
}
function saveData() { 
    const dataToSave = { users, jackpot, globalState, lastSave: Date.now() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2)); 
}
loadData();

function addLog(m) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${m}`);
    serverEvents.unshift(m);
    if(logs.length > 20) logs.pop();
    if(serverEvents.length > 15) serverEvents.pop();
}

// --- ЕЖЕНЕДЕЛЬНЫЙ СБРОС (Понедельник 00:00) ---
setInterval(() => {
    const now = Date.now();
    // Сброс карпов раз в 7 дней
    if (now - globalState.lastReset > 604800000) {
        globalState.weeklyCarpCaught = 0;
        globalState.lastReset = now;
        addLog("🌊 Лимит Золотых Карпов на Озере Надежды обновлен!");
    }
    saveData();
}, 60000);

// --- API ---
app.post('/api/action', async (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();
    if (!userId) return res.status(400).json({ error: "No ID" });

    if (!users[userId]) {
        users[userId] = {
            id: userId, n: userName || "Рыбак", b: 150, fish: 0, 
            energy: 50, dur: 100, total: 0, lastBonus: 0, lastUpdate: now,
            buffs: { titan: false, poacher: 0, hope: 0, vip: 0, myakish: 0 },
            stats: { withdrawLimit: 30000, priority: false } // Доп. поля для VIP
        };
    }

    const u = users[userId];
    let msg = "";
    let catchData = null;

    // --- ЛОГИКА VIP ПРИВИЛЕГИЙ ---
    const isVip = u.buffs.vip > now;
    const maxEnergy = isVip ? 100 : 50;
    const currentWithdrawLimit = isVip ? 10000 : 30000;
    const withdrawalTime = isVip ? "1 час" : "24 часа";

    // Регенерация энергии (теперь зависит от maxEnergy)
    const passed = now - u.lastUpdate;
    if (passed > 300000) { 
        u.energy = Math.min(maxEnergy, u.energy + Math.floor(passed / 300000)); 
        u.lastUpdate = now; 
    }

    switch (action) {
        case 'cast':
            const lake = payload.lake || 'normal';
            if (u.energy < 2) { msg = "Нет энергии!"; break; }
            if (u.dur <= 0 && !u.buffs.titan) { msg = "Почини удочку!"; break; }
            
            // Проверка доступа к озеру
            if (lake === 'hope' && (!u.buffs.hope || u.buffs.hope < now)) {
                msg = "Купи доступ к Озеру Надежды!"; break;
            }

            u.energy -= 2;
            if (!u.buffs.titan) u.dur = Math.max(0, u.dur - 1);
            u.total++;

            // ШАНСЫ
            let rand = Math.random() * 100;
            if (rand < 5 && (!u.buffs.myakish || u.buffs.myakish <= 0)) {
                msg = "Срыв! 🐟"; 
            } else {
                let weight = (Math.random() * 3 + 0.5);
                catchData = { type: "Обычная рыба", w: weight.toFixed(2) + " кг" };
                u.fish += weight;
                if(u.buffs.myakish > 0) u.buffs.myakish--;

                // Логика Озера Надежды
                if (lake === 'hope') {
                    // ЗОЛОТОЙ КАРП
                    let carpChance = (u.buffs.poacher > now) ? 0.5 : 0.01;
                    if (globalState.weeklyCarpCaught < 10 && (Math.random() * 100) < carpChance) {
                        const carpTC = 5000; 
                        u.fish += (carpTC / SELL_PRICE); // Эквивалент в весе
                        catchData = { type: "ЗОЛОТОЙ КАРП! 🏆", w: "5000 TC (эквив.)" };
                        globalState.weeklyCarpCaught++;
                        addLog(`${u.n} выловил КАРПА (${globalState.weeklyCarpCaught}/10)!`);
                    } 
                    // КОШЕЛЬКИ
                    else if (Math.random() < 0.03) {
                        const walletTC = 100 + Math.floor(Math.random() * 201);
                        u.b += walletTC;
                        catchData = { type: "Забытый кошелек 💰", w: walletTC + " TC" };
                        addLog(`${u.n} нашел кошелек на ${walletTC} TC`);
                    }
                }
            }
            break;

        case 'sell':
            if (u.fish <= 0) { msg = "Садок пуст!"; break; }
            const income = Math.floor(u.fish * SELL_PRICE);
            const tax = Math.floor(income * TAX_RATE);
            jackpot.pool += tax;
            u.b += (income - tax);
            u.fish = 0;
            msg = `Продано! +${income - tax} TC (Налог ${tax})`;
            break;

        case 'buy': // Магазин за TC
            const item = payload.id;
            if (item === 'repair' && u.b >= 50) { u.b -= 50; u.dur = 100; msg = "Починено!"; }
            if (item === 'energy' && u.b >= 50) { u.b -= 50; u.energy = maxEnergy; msg = "Заряжен!"; }
            if (item === 'myakish' && u.b >= 100) { u.b -= 100; u.buffs.myakish += 10; msg = "Куплено!"; }
            
            // --- ТОВАРЫ ЗА TON (Обычно обрабатываются через платежный шлюз, но добавляем в логику) ---
            if (item === 'vip_7') { 
                // Здесь будет логика проверки оплаты 2 TON
                u.buffs.vip = now + (7 * 24 * 60 * 60 * 1000); 
                u.energy = 100; // Сразу даем бонус
                msg = "VIP статус активирован на 7 дней!"; 
            }
            if (item === 'infinity_energy') { 
                // Здесь будет логика проверки оплаты 5 TON
                u.energy = 999; // Условно бесконечная на сессию
                msg = "Бесконечная энергия активирована!"; 
            }
            break;

        case 'get_daily':
            if (now - u.lastBonus < 86400000) { msg = "Еще не время!"; }
            else {
                const p = 50 + Math.floor(Math.random()*50);
                u.b += p; u.energy = maxEnergy; u.lastBonus = now;
                msg = `Бонус ${p} TC!`;
            }
            break;
    }

    saveData();
    // Отправляем доп. инфо о лимитах, чтобы фронтенд знал, что показывать
    res.json({ ...u, maxEnergy, withdrawLimit: currentWithdrawLimit, withdrawalTime, msg, catchData, jackpot, events: serverEvents });
});

app.listen(PORT, () => console.log(`[OK] Tamacoin Monolith 4.2.1 на порту ${PORT}`));
