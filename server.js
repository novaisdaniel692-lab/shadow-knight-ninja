const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = fs.existsSync(path.join(ROOT, "data", "db.json"))
  ? path.join(ROOT, "data", "db.json")
  : path.join(ROOT, "db.json");

const initial = {
  players: [{
    id: "player-1",
    name: "Shadow",
    level: 1,
    xp: 0,
    coins: 250,
    realBalance: 0,
    completedMissions: [],
    completedLevels: [],
    achievements: [],
    inventory: [],
    createdAt: new Date().toISOString()
  }],
  transactions: [{
    id: "tx-1",
    playerId: "player-1",
    type: "reward",
    amount: 250,
    description: "Bônus inicial",
    status: "Concluído",
    createdAt: new Date().toISOString()
  }],
  withdrawals: [],
  deposits: [],
  webhookEvents: [],
  missions: [
    {id:"m1", title:"Primeiro passo", description:"Complete a fase 1", reward:100, goal:"level", target:1},
    {id:"m2", title:"Caçador de moedas", description:"Colete 50 moedas", reward:75, goal:"coinsCollected", target:50},
    {id:"m3", title:"Ninja diário", description:"Entre no jogo e reivindique o bônus", reward:50, goal:"daily", target:1}
  ]
};

function ensureDB() {
  fs.mkdirSync(path.dirname(DATA), {recursive:true});
  if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify(initial, null, 2));
}
function db() { ensureDB(); return JSON.parse(fs.readFileSync(DATA, "utf8")); }
function save(x) { fs.writeFileSync(DATA, JSON.stringify(x, null, 2)); }
function send(res, code, obj, type="application/json") {
  res.writeHead(code, {"Content-Type": type});
  res.end(type === "application/json" ? JSON.stringify(obj) : obj);
}
function body(req) {
  return new Promise((resolve,reject)=>{
    let s=""; req.on("data", c=>s+=c);
    req.on("end",()=>{ try { resolve(s ? JSON.parse(s) : {}); } catch(e){ reject(e); }});
  });
}
function playerFrom(d, id="player-1") { return d.players.find(p=>p.id===id); }
function addTx(d,p,type,amount,description,status="Concluído") {
  d.transactions.unshift({id:crypto.randomUUID(),playerId:p.id,type,amount,description,status,createdAt:new Date().toISOString()});
}
function grant(d,p,amount,description) {
  p.coins += amount;
  addTx(d,p,"reward",amount,description);
}
function xpForLevel(level){ return level*250; }

async function api(req,res,url) {
  const d = db();

  // Webhook oficial do Asaas.
  // Configure no ambiente do servidor:
  // ASAAS_WEBHOOK_TOKEN=<token definido no Asaas>
  if (req.method === "POST" && url === "/api/asaas/webhook") {
    let event;
    try {
      event = await body(req);
    } catch (e) {
      return send(res, 400, { error: "JSON inválido" });
    }

    const token = req.headers["asaas-access-token"];
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      return send(res, 401, { error: "Webhook não autorizado" });
    }

    if (!event || !event.id || !event.event) {
      return send(res, 400, { error: "Evento Asaas inválido" });
    }

    d.webhookEvents = Array.isArray(d.webhookEvents) ? d.webhookEvents : [];

    // Idempotência: o Asaas pode reenviar o mesmo evento.
    if (d.webhookEvents.includes(event.id)) {
      return send(res, 200, { received: true, duplicate: true });
    }

    if (event.event === "PAYMENT_RECEIVED") {
      const payment = event.payment || {};
      const deposit = d.deposits.find(
        x => x.paymentId === payment.id
      );

      if (deposit && deposit.status !== "paid") {
        const player = playerFrom(d, deposit.playerId);

        if (player) {
          const amount = Number(payment.netValue ?? payment.value ?? 0);

          if (!Number.isFinite(amount) || amount <= 0) {
            return send(res, 400, { error: "Valor de pagamento inválido" });
          }

          deposit.status = "paid";
          deposit.paidAt = new Date().toISOString();
          deposit.netValue = amount;

          // Saldo financeiro separado das moedas virtuais do jogo.
          player.realBalance = (player.realBalance || 0) + amount;

          addTx(
            d,
            player,
            "deposit",
            amount,
            "Depósito Pix confirmado pelo Asaas",
            "Concluído"
          );
        }
      }
    }

    if (event.event === "TRANSFER_UPDATED") {
      const transfer = event.transfer || {};
      const withdrawal = d.withdrawals.find(
        x => x.transferId === transfer.id
      );

      if (withdrawal) {
        withdrawal.status = transfer.status || withdrawal.status;
        withdrawal.updatedAt = new Date().toISOString();
      }
    }

    d.webhookEvents.push(event.id);
    save(d);

    return send(res, 200, { received: true });
  }
  if (req.method==="GET" && url==="/api/state") {
    const p=playerFrom(d); return send(res,200,{player:p,missions:d.missions,transactions:d.transactions.filter(x=>x.playerId===p.id).slice(0,30),withdrawals:d.withdrawals.filter(x=>x.playerId===p.id),deposits:d.deposits.filter(x=>x.playerId===p.id),leaderboard:d.players.map(x=>({name:x.name,level:x.level,coins:x.coins})).sort((a,b)=>b.level-a.level||b.coins-a.coins)});
  }
  if (req.method==="POST" && url==="/api/daily") {
    const p=playerFrom(d); const day=new Date().toISOString().slice(0,10);
    const already=d.transactions.some(x=>x.playerId===p.id && x.type==="daily" && x.createdAt.slice(0,10)===day);
    if(!already){ p.coins+=50; addTx(d,p,"daily",50,"Bônus diário"); save(d); }
    return send(res,200,{ok:true,claimed:!already,player:p});
  }
  if (req.method==="POST" && url==="/api/complete-level") {
    const b=await body(req), p=playerFrom(d), level=Number(b.level||1);
    if(!Number.isInteger(level)||level<1||level>10) return send(res,400,{error:"Fase inválida"});
    if(!p.completedLevels.includes(level)) {
      p.completedLevels.push(level); p.xp += 100; grant(d,p,100+level*10,`Recompensa da fase ${level}`);
      while(p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; }
    }
    save(d); return send(res,200,{ok:true,player:p});
  }
  if (req.method==="POST" && url==="/api/claim-mission") {
    const b=await body(req), p=playerFrom(d), m=d.missions.find(x=>x.id===b.id);
    if(!m) return send(res,404,{error:"Missão não encontrada"});
    if(p.completedMissions.includes(m.id)) return send(res,400,{error:"Missão já resgatada"});
    let done=false;
    if(m.goal==="level") done=p.completedLevels.includes(m.target);
    if(m.goal==="coinsCollected") done=(p.coinsCollected||0)>=m.target;
    if(m.goal==="daily") done=d.transactions.some(x=>x.playerId===p.id && x.type==="daily" && x.createdAt.slice(0,10)===new Date().toISOString().slice(0,10));
    if(!done) return send(res,400,{error:"Missão ainda não concluída"});
    p.completedMissions.push(m.id); grant(d,p,m.reward,`Missão: ${m.title}`); save(d);
    return send(res,200,{ok:true,player:p});
  }
  if (req.method==="POST" && url==="/api/collect") {
    const b=await body(req), p=playerFrom(d), amount=Math.min(Math.max(Number(b.amount||0),0),100);
    p.coinsCollected=(p.coinsCollected||0)+amount; p.coins+=amount;
    addTx(d,p,"coin",amount,"Moedas coletadas na fase"); save(d);
    return send(res,200,{ok:true,player:p});
  }
  if (req.method==="POST" && url==="/api/deposit-demo") {
    const b=await body(req), p=playerFrom(d), amount=Math.min(Math.max(Number(b.amount||0),0),100000);
    if(!amount) return send(res,400,{error:"Informe um valor válido"});
    d.deposits.unshift({id:crypto.randomUUID(),playerId:p.id,amount,method:b.method||"Pix",status:"SIMULAÇÃO — não processado",createdAt:new Date().toISOString()});
    addTx(d,p,"deposit-demo",amount,"Depósito demonstrativo (sem dinheiro real)","SIMULAÇÃO");
    save(d); return send(res,200,{ok:true,notice:"Depósito apenas demonstrativo. Nenhum pagamento real foi processado.",player:p});
  }
  if (req.method==="POST" && url==="/api/withdraw-demo") {
    const b=await body(req), p=playerFrom(d), amount=Math.floor(Number(b.amount||0));
    if(!amount || amount>p.coins) return send(res,400,{error:"Valor inválido ou saldo virtual insuficiente"});
    // Deduct virtual coins only. Never claim real transfer.
    p.coins-=amount;
    const w={id:crypto.randomUUID(),playerId:p.id,amount,method:b.method||"Pix",status:"Pendente — SIMULAÇÃO",createdAt:new Date().toISOString()};
    d.withdrawals.unshift(w);
    addTx(d,p,"withdrawal-demo",-amount,"Saque demonstrativo de moedas virtuais","SIMULAÇÃO");
    save(d); return send(res,200,{ok:true,notice:"Solicitação registrada apenas como simulação. Nenhum dinheiro real foi enviado.",withdrawal:w,player:p});
  }
  if (req.method==="GET" && url==="/api/admin") {
    return send(res,200,{players:d.players,transactions:d.transactions,withdrawals:d.withdrawals,deposits:d.deposits,missions:d.missions});
  }
  if (req.method==="POST" && url==="/api/admin/withdrawal-status") {
    const b=await body(req), w=d.withdrawals.find(x=>x.id===b.id);
    if(!w) return send(res,404,{error:"Solicitação não encontrada"});
    if(!["Pendente — SIMULAÇÃO","Processando — SIMULAÇÃO","Concluído — SIMULAÇÃO"].includes(b.status)) return send(res,400,{error:"Status inválido"});
    w.status=b.status; save(d); return send(res,200,{ok:true});
  }
  send(res,404,{error:"Rota não encontrada"});
}

function serve(req,res) {
  let u = decodeURIComponent(req.url.split("?")[0]);
  if(u==="/") u="/index.html";
  if(u==="/admin") u="/admin.html";

  // Aceita tanto a estrutura correta com /public quanto arquivos na raiz.
  // Isso facilita o deploy pelo GitHub pelo celular.
  const candidates = [];
  if (fs.existsSync(PUBLIC)) candidates.push(path.normalize(path.join(PUBLIC,u)));
  candidates.push(path.normalize(path.join(ROOT,u)));
  const file = candidates.find(f => fs.existsSync(f));

  if(!file || !file.startsWith(ROOT)) return send(res,404,"Not found","text/plain");
  fs.readFile(file,(err,data)=>{
    if(err) return send(res,404,"Not found","text/plain");
    const ext=path.extname(file);
    const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".json":"application/json; charset=utf-8"};
    send(res,200,data,types[ext]||"application/octet-stream");
  });
}
ensureDB();
http.createServer(async(req,res)=>{
  try {
    const url=req.url.split("?")[0];
    if(url.startsWith("/api/")) await api(req,res,url);
    else serve(req,res);
  } catch(e) { send(res,500,{error:"Erro interno do protótipo"}); }
}).listen(PORT,()=>console.log(`Shadow Knight Ninja: http://localhost:${PORT}`));
