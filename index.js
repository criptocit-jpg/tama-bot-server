const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE = './users.json';

const BOT_TOKEN = 'PASTE_YOUR_TOKEN';
const ADMIN_CHAT_ID = '7883085758';

let users = {};
let logs = ["Сервер Tamacoin запущен!"];
let serverEvents = [];
let dailyCounters = { goldenCarp: 0, lostWallets: 0 };

const GOLDEN_LIMIT = 10;
const WALLET_LIMIT = 200;
const MIN_WITHDRAW = 30000;

// ---------- DATA ----------
function loadData(){
    if(fs.existsSync(DATA_FILE)){
        try{ users = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
        catch{ users={}; }
    }
}
function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(users,null,2)); }
loadData();

// ---------- KEEP RENDER AWAKE ----------
setInterval(()=>{ axios.get("https://tama-bot-server.onrender.com").catch(()=>{}); },300000);

// ---------- TELEGRAM START ----------
app.post('/telegram', async(req,res)=>{
    const msg=req.body.message;
    if(!msg) return res.sendStatus(200);

    if(msg.text==='/start'){
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
            chat_id:msg.chat.id,
            text:"🎣 Tamacoin Fishing\nНажми кнопку чтобы играть",
            reply_markup:{
                inline_keyboard:[[
                    {text:"ОТКРЫТЬ ИГРУ",web_app:{url:"https://tama-bot-server.onrender.com"}}
                ]]
            }
        });
    }
    res.sendStatus(200);
});

// ---------- GAME API ----------
app.post('/api/action',(req,res)=>{
    const {userId,userName,action}=req.body;
    if(!userId) return res.json({error:"no user"});

    if(!users[userId]){
        users[userId]={id:userId,n:userName||"Игрок",b:150,fish:0,energy:100,dur:100,lastBonus:0};
    }
    const u=users[userId];
    let msg="";

    if(action==='load'){}

    if(action==='cast'){
        if(u.energy<=0){msg="Нет энергии"; }
        else{
            u.energy--;
            const w=(Math.random()*3+0.5);
            u.fish+=w;
            msg=`Поймано ${w.toFixed(2)} кг`;
        }
    }

    if(action==='sell'){
        const money=Math.floor(u.fish*2);
        u.b+=money;
        u.fish=0;
        msg=`Продано на ${money}`;
    }

    if(action==='withdraw'){
        res.json({msg:"Заявка отправлена"});
        axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
            chat_id:ADMIN_CHAT_ID,
            text:`Вывод ${u.n} ${req.body.payload.sum}`
        }).catch(()=>{});
        return;
    }

    saveData();
    res.json({...u,msg});
});

app.get('/',(req,res)=>res.send("OK"));
app.listen(PORT,()=>console.log("SERVER STARTED"));
