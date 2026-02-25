const tg = window.Telegram.WebApp;
tg.ready(); 
tg.expand();

const URL = 'https://tama-bot-server.onrender.com/api/action';
let user = { lastBonus: 0 };

// --------------------- Функции переключения страниц ---------------------
function showP(id, el){
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
}

function toggleAcc(el){ 
    el.parentElement.classList.toggle('open'); 
}

// --------------------- Всплыющие уведомления ---------------------
function toast(txt){
    let t = document.getElementById('toast');
    if(!t){
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.innerText = txt;
    t.style.display='block';
    setTimeout(()=>t.style.display='none',2500);
}

// --------------------- Копирование реферальной ссылки ---------------------
function copyRef(){
    const text = "https://t.me/TamacoinBot?start=" + user.id;
    navigator.clipboard.writeText(text);
    toast("Ссылка скопирована!");
}

// --------------------- Анимация цифр ---------------------
function animateNum(el, newValue){
    if(!el) return;
    let current = parseInt(el.dataset.value || 0);
    newValue = Math.floor(newValue);
    el.dataset.value = newValue;
    if(current === newValue) return;
    let diff = newValue - current;
    let step = Math.max(1, Math.floor(Math.abs(diff)/15));
    let sign = diff>0?1:-1;
    let i = 0;
    let interval = setInterval(()=>{
        i++;
        let val = current + sign*step*i;
        if((sign>0 && val>=newValue)||(sign<0 && val<=newValue)){
            val=newValue; clearInterval(interval);
        }
        el.innerText = val.toLocaleString();
    },30);
}

// --------------------- Основной рендер ---------------------
function render(d){
    if(!d || !d.id) return;
    user = d;
    animateNum(document.querySelector('#u-b .animated-num'), d.b);
    animateNum(document.querySelector('#u-en'), d.energy || 0);
    animateNum(document.querySelector('#u-dur'), Math.max(0,d.dur||0));
    animateNum(document.querySelector('#u-box'), d.boxes || 0);
    document.getElementById('u-fish').innerText = (d.fish||0).toFixed(2);
    document.getElementById('ref-text').innerText = "Ваша ссылка: https://t.me/TamacoinBot?start=" + d.id;

    if(d.top){
        document.getElementById('top-list').innerHTML = d.top.map((x,i)=>
            `<div class="stat-mini" style="margin-bottom:5px; display:flex; justify-content:space-between;">
                <span>${i+1}. ${x.n}</span><b>${Math.floor(x.b)} TC</b>
            </div>`
        ).join('');
    }
}

// --------------------- Ловля рыбы ---------------------
function doCast(){
    const f = document.getElementById('fish-anim');
    const b = document.getElementById('btn-cast');
    const o = document.getElementById('ocean');
    f.style.display='block'; 
    b.disabled=true; 
    o.classList.add('active');
    setTimeout(()=>{
        f.style.display='none'; 
        b.disabled=false; 
        o.classList.remove('active');
        api('cast');
    },1300);
}

// --------------------- Вывод средств ---------------------
function withdraw(){
    const wallet = document.getElementById('w-wallet').value;
    const sum = parseInt(document.getElementById('w-sum').value);
    if(!wallet || !sum) return toast("Заполни поля!");
    if(sum<30000) return toast("Вывод возможен только от 30 000 TC!");
    api('withdraw', {wallet, sum});
}

// --------------------- API вызов ---------------------
async function api(action, payload={}){
    try{
        const uid = tg.initDataUnsafe?.user?.id || "7883085758";
        const uname = tg.initDataUnsafe?.user?.first_name || "Рыбак";
        const r = await fetch(URL,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({userId:uid,userName:uname,action,payload})
        });
        const d = await r.json();
        if(d.msg) toast(d.msg);
        render(d);
        if(d.events) updateTicker(d.events);
        if(d.catchData){
            document.getElementById('catch-res')?.innerHTML=d.catchData.type+'<br>'+d.catchData.w+' кг';
            document.getElementById('wood-plate').classList.add('show');
        }
    }catch(e){ console.error(e); }
}

// --------------------- Обновление бегущей строки ---------------------
function updateTicker(events){
    const ticker = document.getElementById('ticker');
    if(!events||!events.length) return;
    ticker.innerHTML = events.join(' | ');
    ticker.style.animation='none';
    void ticker.offsetWidth;
    ticker.style.animation='scroll 20s linear infinite';
}

// --------------------- Таймеры ---------------------
setInterval(()=>{
    const now = new Date();

    // Золотой час
    let target = new Date();
    target.setHours(19,0,0,0);
    if(now>target) target.setDate(target.getDate()+1);
    let diff = target-now;
    const h = String(Math.floor(diff/3600000)).padStart(2,'0');
    const m = String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
    const s = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
    document.getElementById('t-gold').innerText=(now.getHours()===19)?"АКТИВЕН! 🔥":h+":"+m+":"+s;

    // Ежедневный бонус
    let bDiff=(user.lastBonus+86400000)-Date.now();
    if(bDiff>0){
        const bh=String(Math.floor(bDiff/3600000)).padStart(2,'0');
        const bm=String(Math.floor((bDiff%3600000)/60000)).padStart(2,'0');
        const bs=String(Math.floor((bDiff%60000)/1000)).padStart(2,'0');
        document.getElementById('t-daily').innerText=bh+":"+bm+":"+bs;
        document.getElementById('btn-daily').style.display='none';
    } else {
        document.getElementById('t-daily').innerText="ГОТОВО!";
        document.getElementById('btn-daily').style.display='block';
    }

},1000);

// --------------------- Инициализация прокрутки ---------------------
const style=document.createElement('style');
style.innerHTML=`@keyframes scroll {0%{transform:translateX(100%);}100%{transform:translateX(-100%);}}`;
document.head.appendChild(style);
