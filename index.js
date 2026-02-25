// index.js (серверная часть бота)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let users = {};
let events = [];

// функция генерации случайной рыбы
function catchFish() {
    const types = ['Лосось','Судак','Щука','Карп','Тунец'];
    const w = (Math.random()*5 + 0.1).toFixed(2);
    return { type: types[Math.floor(Math.random()*types.length)], w: parseFloat(w) };
}

// функция обновления топа
function getTop() {
    const arr = Object.values(users);
    arr.sort((a,b)=>b.b - a.b);
    return arr.slice(0,10).map(u=>({n:u.userName, b:u.b}));
}

// POST endpoint для всех действий
app.post('/api/action', (req,res)=>{
    const { userId, userName, action, payload } = req.body;

    if(!users[userId]) users[userId] = {id:userId,userName, b:0, energy:100, dur:100, boxes:0, fish:0, lastBonus:0};

    const u = users[userId];
    let msg = '';
    let catchData = null;

    switch(action){
        case 'cast':
            if(u.energy<5){ msg="Недостаточно энергии!"; break; }
            u.energy -= 5;
            u.dur = Math.max(0, u.dur - Math.random()*5);
            const fish = catchFish();
            u.fish += fish.w;
            msg = `Вы поймали ${fish.w} кг ${fish.type}!`;
            catchData = fish;
            events.unshift(`${userName} поймал ${fish.w} кг ${fish.type}`);
            if(events.length>20) events.pop();
        break;

        case 'sell':
            if(u.fish<=0){ msg="Нечего продавать!"; break; }
            const gain = Math.floor(u.fish*100);
            u.b += gain;
            u.boxes += Math.floor(u.fish);
            u.fish = 0;
            msg = `Вы продали рыбу за ${gain} TC!`;
        break;

        case 'get_daily':
            const now = Date.now();
            if(now - u.lastBonus < 86400000){ msg="Бонус ещё недоступен!"; break; }
            const bonus = 1000;
            u.b += bonus;
            u.lastBonus = now;
            msg = `Вы получили дневной бонус ${bonus} TC!`;
        break;

        case 'buy':
            const shop = {
                'myakish':100,
                'gear':200,
                'energy':50,
                'repair':50,
                'titan':150,
                'bait':200,
                'strong':200,
                'license':500
            };
            const id = payload.id;
            if(!shop[id]){ msg="Товар не найден!"; break; }
            if(u.b<shop[id]){ msg="Недостаточно TC!"; break; }
            u.b -= shop[id];
            msg = `Вы купили ${id} за ${shop[id]} TC!`;
        break;

        case 'withdraw':
            const sum = payload.sum || 0;
            if(sum>u.b){ msg="Недостаточно TC для вывода!"; break; }
            u.b -= sum;
            msg = `Заявка на вывод ${sum} TC принята! Средства переведены на кошелек ${payload.wallet}`;
        break;

        default:
            msg = "Неизвестное действие!";
        break;
    }

    const response = {
        msg,
        id:u.id,
        userName:u.userName,
        b:u.b,
        energy:u.energy,
        dur:u.dur,
        boxes:u.boxes,
        fish:u.fish,
        lastBonus:u.lastBonus,
        top: getTop(),
        events,
        catchData
    };

    res.json(response);
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
