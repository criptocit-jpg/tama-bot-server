const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const http = require('http');

const BOT_TOKEN = '8449158911:AAHoIGP7_MwhHG--gyyFiQoplDFewO47zNg';
const DB_PATH = './database.json';
const bot = new Telegraf(BOT_TOKEN);

// Чтение/запись базы
function readDB() { try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { return {}; } }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// СЕРВЕР ДЛЯ ПРИЕМА ЗАПРОСОВ (API)
const server = http.createServer(async (req, res) => {
    // Разрешаем запросы с любого адреса (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/api/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            const data = JSON.parse(body);
            const db = readDB();
            const id = data.userId;
            if (!db[id]) db[id] = { balance: 0, fish: 0 };

            if (data.action === 'catch_fish') {
                const w = parseFloat((Math.random() * 2 + 0.1).toFixed(2));
                db[id].fish += w;
                writeDB(db);
                await bot.telegram.sendMessage(id, `🎣 Улов: ${w} кг! В садке: ${db[id].fish.toFixed(2)} кг`);
            }
            
            if (data.action === 'sell_fish') {
                const money = (db[id].fish * 0.1).toFixed(2);
                db[id].balance = (parseFloat(db[id].balance) + parseFloat(money)).toFixed(2);
                db[id].fish = 0;
                writeDB(db);
                await bot.telegram.sendMessage(id, `💰 Продано! Баланс: ${db[id].balance} TC`);
            }

            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok' }));
        });
    } else {
        res.writeHead(200);
        res.end('Bot server is live!');
    }
});

server.listen(process.env.PORT || 3000);
bot.start((ctx) => ctx.reply('РЫБАЛКА В ОБЛАКЕ! 🚀', Markup.keyboard([[Markup.button.webApp('🎣 ИГРАТЬ', 'https://criptocit-jpg.github.io/tama-fishing/')]]).resize()));
bot.launch();
