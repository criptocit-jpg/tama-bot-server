import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Хранилище пользователей (для примера, на проде лучше БД)
let users = {};
let events = [];

// Игра: примеры бонусов, золотой час
const GOLD_HOUR = 19; // 19:00
const DAILY_BONUS = 1000;

function getUser(id, name) {
    if (!users[id]) {
        users[id] = {
            id,
            name,
            b: 0,
            fish: 0,
            energy: 100,
            dur: 100,
            boxes: 0,
            lastBonus: 0,
            top: []
        };
    }
    return users[id];
}

function formatTop() {
    // Топ игроков по TC
    return Object.values(users)
        .sort((a, b) => b.b - a.b)
        .slice(0, 10)
        .map(u => ({ n: u.name, b: u.b }));
}

// Основной API для действий игрока
app.post('/api/action', (req, res) => {
    const { userId, userName, action, payload } = req.body;
    const u = getUser(userId, userName);
    let msg = '';
    try {
        switch (action) {
            case 'cast':
                if (u.energy <= 0) { msg = 'Нет энергии!'; break; }
                const catchWeight = +(Math.random() * 5).toFixed(2);
                u.fish += catchWeight;
                u.energy = Math.max(0, u.energy - 10);
                msg = `Поймана рыба ${catchWeight} кг!`;
                events.unshift(`${u.name} поймал ${catchWeight} кг!`);
                break;
            case 'sell':
                if (u.fish <= 0) { msg = 'Нет рыбы!'; break; }
                const earned = Math.floor(u.fish * 100);
                u.b += earned;
                u.fish = 0;
                msg = `Продано за ${earned} TC!`;
                events.unshift(`${u.name} продал рыбу за ${earned} TC`);
                break;
            case 'buy':
                const items = { myakish: 100, gear: 200, energy: 50, repair: 50, titan: 150, bait: 200, strong: 200, license: 500 };
                const id = payload.id;
                if (!items[id]) { msg = 'Товар не найден'; break; }
                if (u.b < items[id]) { msg = 'Недостаточно TC'; break; }
                u.b -= items[id];
                msg = `Куплено: ${id}`;
                events.unshift(`${u.name} купил ${id} за ${items[id]} TC`);
                break;
            case 'get_daily':
                const now = Date.now();
                if (now - u.lastBonus >= 86400000) { // 24 часа
                    u.b += DAILY_BONUS;
                    u.lastBonus = now;
                    msg = `Бонус ${DAILY_BONUS} TC получен!`;
                    events.unshift(`${u.name} получил дневной бонус ${DAILY_BONUS} TC`);
                } else {
                    msg = 'Бонус еще не доступен';
                }
                break;
            case 'withdraw':
                const { wallet, sum } = payload;
                if (sum < 30000) { msg = 'Вывод возможен от 30 000 TC'; break; }
                if (u.b < sum) { msg = 'Недостаточно TC'; break; }
                u.b -= sum;
                msg = `Заявка на вывод ${sum} TC отправлена на кошелек ${wallet}`;
                events.unshift(`${u.name} вывел ${sum} TC на ${wallet}`);
                break;
            default:
                msg = 'Неизвестное действие';
        }

        res.json({
            id: u.id,
            b: u.b,
            fish: u.fish,
            energy: u.energy,
            dur: u.dur,
            boxes: u.boxes,
            lastBonus: u.lastBonus,
            top: formatTop(),
            events: events.slice(0, 20),
            msg,
            catchData: action === 'cast' ? { type: 'Рыба', w: +(Math.random()*5).toFixed(2) } : null
        });
    } catch (e) {
        console.error(e);
        res.json({ msg: 'Ошибка сервера' });
    }
});

// Статика для index.html и анимаций
app.use(express.static('.'));

// Запуск сервера
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
