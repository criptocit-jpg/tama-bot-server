const tg=window.Telegram.WebApp;
tg.ready(); tg.expand();
const URL='https://tama-bot-server.onrender.com/api/action';
let user={lastBonus:0};

function showP(id,el){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');
}
function toggleAcc(el){ el.parentElement.classList.toggle('open'); }
function toast(txt){
    let t=document.getElementById('toast');
    if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t);}
    t.innerText=txt; t.style.display='block';
    setTimeout(()=>t.style.display='none',2500);
}
function copyRef(){
    const text="https://t.me/TamacoinBot?start="+(user.id||"7883085758");
    navigator.clipboard.writeText(text);
    toast("Ссылка скопирована!");
}

async function api(action,payload={}){
    try{
        const uid=tg.initDataUnsafe?.user?.id||"7883085758";
        const uname=tg.initDataUnsafe?.user?.first_name||"Рыбак";
        const r=await fetch(URL,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({userId:uid,userName:uname,action,payload})
        });
        const d=await r.json();
        if(d.msg) toast(d.msg);
        render(d);
    }catch(e){ console.error(e); }
}

function render(d){
    if(!d||!d.id) return;
    user=d;
    animateNumber('u-b',Math.floor(d.b||0));
    document.getElementById('u-fish').innerText=(d.fish||0).toFixed(2);
    document.getElementById('u-en').innerText=d.energy||0;
    document.getElementById('u-dur').innerText=Math.max(0,d.dur||0)+'%';
    document.getElementById('u-box').innerText=d.boxes||0;
}

function animateNumber(id,target){
    const el=document.getElementById(id);
    const start=parseInt(el.innerText.replace(/\D/g,''))||0;
    const duration=500;
    const stepTime=15;
    const steps=Math.ceil(duration/stepTime);
    let current=0;
    const diff=target-start;
    const interval=setInterval(()=>{
        current++;
        el.innerText=Math.floor(start + diff*current/steps).toLocaleString();
        if(current>=steps) clearInterval(interval);
    },stepTime);
}

function doCast(){
    const f=document.getElementById('fish-anim');
    const b=document.getElementById('btn-cast');
    const o=document.getElementById('ocean');
    f.style.display='block'; b.disabled=true; o.classList.add('active');
    setTimeout(()=>{
        f.style.display='none'; b.disabled=false; o.classList.remove('active');
        api('cast');
    },1300);
}

setInterval(()=>{
    const now=new Date();
    let target=new Date(); target.setHours(19,0,0,0);
    if(now>target) target.setDate(target.getDate()+1);
    let diff=target-now;
    const h=String(Math.floor(diff/3600000)).padStart(2,'0');
    const m=String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
    const s=String(Math.floor((diff%60000)/1000)).padStart(2,'0');
    document.getElementById('t-gold').innerText=(now.getHours()===19)?"АКТИВЕН! 🔥":h+":"+m+":"+s;

    let bDiff=(user.lastBonus+86400000)-Date.now();
    if(bDiff>0){
        const bh=String(Math.floor(bDiff/3600000)).padStart(2,'0');
        const bm=String(Math.floor((bDiff%3600000)/60000)).padStart(2,'0');
        const bs=String(Math.floor((bDiff%60000)/1000)).padStart(2,'0');
        document.getElementById('t-daily').innerText=bh+":"+bm+":"+bs;
        document.getElementById('btn-daily').style.display='none';
    }else{
        document.getElementById('t-daily').innerText="ГОТОВО!";
        document.getElementById('btn-daily').style.display='block';
    }
},1000);
