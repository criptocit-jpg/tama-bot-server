const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const ADMIN_CHAT_ID = '7883085758';

let users = {};
let logs = ["Сервер Tamacoin запущен!"];
let serverEvents = []; // Бегущая строка
let dailyCounters = { goldenCarp: 0, lostWallets: 0 };

// --- Настройка лимитов ---
const GOLDEN_LIMIT = 10;
const WALLET_LIMIT = 200;
const MIN_WITHDRAW = 30000;

// --- Работа с данными ---
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try { users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } 
        catch(e){ users = {}; }
    }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2)); }
loadData();

// --- Логи и события ---
function addLog(m) {
    logs.unshift(`[${new Date().toLocaleTimeString()}] ${m}`);
    serverEvents.unshift(`${m}`);
    if(logs.length>10) logs.pop();
    if(serverEvents.length>20) serverEvents.pop(); // последние 20 событий для бегущей строки
}

// --- Сброс дневных лимитов ---
setInterval(()=>{
    const now = new Date();
    if(now.getHours()===0 && now.getMinutes()===0){
        dailyCounters.goldenCarp = 0;
        dailyCounters.lostWallets = 0;
    }
},60000);

// --- API ---
app.post('/api/action', async (req,res)=>{
    const { userId, userName, action, payload } = req.body;
    const now = Date.now();
    if(!userId) return res.status(400).json({error:"No user ID"});

    if(!users[userId]){
        users[userId] = {
            id:userId,n:userName||"Рыбак",b:150,s:0,
            fish:0,energy:100,dur:100,
            buffs:{ myakish:0, gear:0, titan:0, bait:0, strong:0, license:false },
            total:0,lastBonus:0,lastUpdate:now,boxes:0,withdrawals:[]
        };
    }

    const u = users[userId];
    let msg="";
    let catchData=null;

    // Энергия
    const passed = now-u.lastUpdate;
    if(passed>300000){ u.energy=Math.min(100,u.energy+Math.floor(passed/300000)); u.lastUpdate=now; }

    switch(action){
        case 'load': break;

        case 'get_daily':
            if(now-u.lastBonus<86400000){ msg="Бонус еще не готов!"; }
            else{
                const prize=50+Math.floor(Math.random()*50);
                u.b+=prize; u.energy=100; u.lastBonus=now;
                msg=`Получено ${prize} TC и ⚡ Энергия!`;
                addLog(`${u.n} взял бонус`);
            }
            break;

        case 'cast':
            if(u.energy<2){ msg="Нет энергии! ⚡"; break; }
            if(u.dur<=0){ msg="Почини удочку! 🛠️"; break; }
            u.energy-=2;
            u.dur-=(u.buffs.titan>now)?0.5:1;

            let rand=Math.random()*100;
            // Срыв рыбы
            if(rand<5 && u.buffs.myakish<=0){ msg="Срыв рыбы! 🐟"; }
            else if(rand<7.5 && u.buffs.strong<now){ u.dur-=5; msg="Обрыв лески! 🪝"; }
            else{
                let w=(Math.random()*3+0.5)*(u.buffs.bait>now?2:1);
                if(new Date().getHours()===19) w*=2;
                u.fish+=w;
                if(u.buffs.myakish>0) u.buffs.myakish--;
                catchData={type:"Рыба", w:w.toFixed(2)};

                // --- Редкие события ---
                if(u.buffs.license){ // лицензия на Озеро Надежды
                    // Золотой карп
                    if(dailyCounters.goldenCarp<GOLDEN_LIMIT && Math.random()<0.01){
                        u.fish+=5000;
                        catchData={type:"Золотой Карп", w:5000};
                        dailyCounters.goldenCarp++;
                        addLog(`${u.n} поймал Золотого карпа!`);
                    }
                    // Утерянный кошелек
                    if(dailyCounters.lostWallets<WALLET_LIMIT && Math.random()<0.005){
                        const walletTC=100+Math.floor(Math.random()*201); // 100-300
                        u.b+=walletTC;
                        dailyCounters.lostWallets++;
                        addLog(`${u.n} нашел утерянный кошелек +${walletTC} TC!`);
                    }
                }
            }
            break;

        case 'sell':
            if(u.fish<=0){ msg="Садок пуст!"; break; }
            const money=Math.floor(u.fish*2);
            const tax = Math.floor(money*0.05); // 5% налог
            u.b+=money-tax; u.fish=0;
            msg=`Продано на ${money-tax} TC! (Налог 5%)`;
            addLog(`${u.n} продал рыбу за ${money-tax} TC`);
            break;

        case 'buy':
            const item=payload.id;
            const prices={ myakish:100, gear:200, energy:50, repair:50, titan:150, bait:200, strong:200, license:500 };
            if(u.b<prices[item]){ msg="Недостаточно TC!"; break; }
            u.b-=prices[item];
            const h=3600000;
            if(item==='myakish') u.buffs.myakish+=10;
            if(item==='energy') u.energy=100;
            if(item==='repair') u.dur=100;
            if(item==='gear') u.buffs.gear=now+(24*h);
            if(item==='titan') u.buffs.titan=now+(12*h);
            if(item==='bait') u.buffs.bait=now+(3*h);
            if(item==='strong') u.buffs.strong=now+(24*h);
            if(item==='license') u.buffs.license=true;
            msg="Успешно куплено!";
            addLog(`${u.n} купил ${item}`);
            break;

        case 'withdraw':
            const { wallet, sum } = payload;
            const amt = parseInt(sum);
            if(!wallet || isNaN(amt) || amt<MIN_WITHDRAW){ msg=`Вывод возможен только от ${MIN_WITHDRAW} TC!`; break; }
            if(u.b<amt){ msg="Недостаточно TC!"; break; }

            if(!u.withdrawals) u.withdrawals=[];
            const id=Math.floor(Math.random()*1000000);
            u.withdrawals.push({id, wallet, sum:amt, status:'pending', date:now});
            try{
                const text=`💰 <b>НОВАЯ ЗАЯВКА НА ВЫВОД</b>\n\n👤 Игрок: ${u.n} (ID: <code>${u.id}</code>)\n💵 Сумма: <b>${amt} TC</b>\n👛 Кошелек: <code>${wallet}</code>\n🆔 Заявка: ${id}`;
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id:ADMIN_CHAT_ID,
                    text,
                    parse_mode:'HTML'
                });
                msg="✅ Заявка отправлена! Ожидайте обработки.";
                addLog(`Вывод: ${u.n} (${amt} TC) — pending`);
            }catch(err){
                console.error("TG Error:", err.response?err.response.data:err.message);
                msg="Ошибка отправки в чат!";
            }
            break;

        case 'get_events':
            res.json({events: serverEvents});
            return;
    }

    saveData();
    const top=Object.values(users).sort((a,b)=>b.b-a.b).slice(0,10).map(x=>({n:x.n,b:x.b}));
    res.json({...u, msg, catchData, top, logs, events:serverEvents});
});

app.listen(PORT,()=>console.log(`Server running on ${PORT}`));
