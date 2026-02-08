const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');

// Настройки
const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const DB_PATH = './database.json';
const bot = new Telegraf(BOT_TOKEN);

// Функции базы данных
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function writeDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) { console.log('Ошибка записи БД:', e.message); }
}

// СОЗДАНИЕ СЕРВЕРА С ПОДДЕРЖКОЙ API
const server = http.createServer(async (req, res) => {
    // Настройка заголовков, чтобы браузер не блокировал запросы (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Ответ на предварительный запрос браузера
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Обработка действий из игры
    if (req.url === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const db = readDB();
                const id = data.userId;

                if (!id) throw new Error('No User ID');
                if (!db[id]) db[id] = { balance: 0, fish: 0, energy: 15 };

                console.log(`>>> Игрок ${id} выполнил: ${data.action}`);

                // Логика рыбалки
                if (data.action === 'catch_fish') {
                    const weight = parseFloat((Math.random() * 2.5 + 0.1).toFixed(2));
                    db[id].fish = parseFloat((db[id].fish + weight).toFixed(2));
                    writeDB(db);
                    await bot.telegram.sendMessage(id, `🎣 +${weight} кг! В садке: ${db[id].fish} кг`, { disable_notification: true });
                }

                // Логика продажи
                if (data.action === 'sell_fish') {
                    const gain = parseFloat((db[id].fish * 0.1).toFixed(2));
                    db[id].balance = parseFloat((db[id].balance + gain).toFixed(2));
                    db[id].fish = 0;
                    writeDB(db);
                    await bot.telegram.sendMessage(id, `💰 Продано! Баланс: ${db[id].balance} TC`);
                }

                // Ответ игре, чтобы она знала, что всё ок
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', balance: db[id].balance }));
            } catch (e) {
                console.log('Ошибка API:', e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ status: 'error' }));
            }
        });
    } else {
        // Обычная заглушка для Render
        res.writeHead(200);
        res.end('Tama Fishing Server is Live!');
    }
});

// Запуск сервера на порту Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`>>> API СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT} <<<`);
});

// Команды бота
bot.start((ctx) => {
    ctx.reply('🌊 ДОБРО ПОЖАЛОВАТЬ В ТАМАКОИН!\n\nРыбачь прямо в приложении, продавай улов и копи на мотоцикл! 🏍️', 
        Markup.keyboard([
            [Markup.button.webApp('🎣 ИГРАТЬ (WEB APP)', 'https://criptocit-jpg.github.io/tama-fishing/')]
        ]).resize()
    );
});

// Запуск бота
bot.launch().then(() => console.log('>>> ТЕЛЕГРАМ БОТ ЗАПУЩЕН <<<'));

// Остановка для безопасности
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
