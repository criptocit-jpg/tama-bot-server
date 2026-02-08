const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http'); // Добавлено для хостинга

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const DB_PATH = './database.json';
const ADMIN_ID = 7883085758;
const WEB_APP_URL = 'https://criptocit-jpg.github.io/tama-fishing/index.html';

const bot = new Telegraf(BOT_TOKEN);

// Заглушка для хостинга, чтобы он не отключал бота
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(process.env.PORT || 3000);

function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

bot.on('web_app_data', async (ctx) => {
    const db = readDB();
    const id = ctx.from.id;
    if (!db[id]) db[id] = { name: ctx.from.first_name, balance: 0, fish: 0, energy: 15 };
    
    let rawData;
    try {
        const dataField = ctx.webAppData.data;
        const jsonString = typeof dataField.text === 'function' ? await dataField.text() : dataField;
        rawData = JSON.parse(jsonString);
    } catch (e) { return; }

    if (rawData.action === 'catch_fish') {
        const weight = parseFloat((Math.random() * 2 + 0.5).toFixed(2));
        db[id].fish = parseFloat((db[id].fish + weight).toFixed(2));
        writeDB(db);
        ctx.reply('🎣 + ' + weight + ' кг! Итого в садке: ' + db[id].fish + ' кг');
    }

    if (rawData.action === 'sell_fish') {
        const gain = parseFloat((db[id].fish * 0.1).toFixed(2));
        db[id].balance = parseFloat((db[id].balance + gain).toFixed(2));
        db[id].fish = 0;
        writeDB(db);
        ctx.reply('💰 Продано! Баланс: ' + db[id].balance.toFixed(2) + ' TC');
    }
});

bot.start((ctx) => {
    ctx.reply('ДОБРО ПОЖАЛОВАТЬ В ТАМАКОИН! 🚀', Markup.keyboard([
        [Markup.button.webApp('🎣 ИГРАТЬ (WEB APP)', WEB_APP_URL)]
    ]).resize());
});

bot.launch().then(() => console.log('>>> СЕРВЕРНЫЙ БОТ 10.0 ЗАПУЩЕН <<<'));