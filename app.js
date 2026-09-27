const API = "/api";

const demoBalanceEl = document.getElementById("demoBalance");
const realBalanceEl = document.getElementById("realBalance");
const rewardHistoryEl = document.getElementById("rewardHistory");
const withdrawHistoryEl = document.getElementById("withdrawHistory");

function formatBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

async function apiRequest(url, options = {}) {
  const response = await fetch(`${API}${url}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Ocorreu um erro.");
  }

  return data;
}

function safeText(value) {
  return String(value ?? "");
}

function renderTransactions(transactions = []) {
  if (!rewardHistoryEl) return;

  if (!transactions.length) {
    rewardHistoryEl.textContent = "Nenhuma movimentação DEMO ainda.";
    return;
  }

  rewardHistoryEl.innerHTML = transactions.map(item => {
    const date = new Date(item.createdAt).toLocaleString("pt-BR");

    return `
      <div class="history-item">
        <strong>${safeText(item.description)}</strong>
        <span>${formatBRL(item.amount)}</span>
        <small>${date} · DEMONSTRAÇÃO</small>
      </div>
    `;
  }).join("");
}

function renderWithdrawals(requests = []) {
  if (!withdrawHistoryEl) return;

  if (!requests.length) {
    withdrawHistoryEl.textContent = "Nenhuma solicitação simulada.";
    return;
  }

  withdrawHistoryEl.innerHTML = requests.map(item => {
    const date = new Date(item.createdAt).toLocaleString("pt-BR");

    return `
      <div class="history-item">
        <strong>Saque simulado</strong>
        <span>${formatBRL(item.amount)}</span>
        <small>${safeText(item.status)} · ${date}</small>
      </div>
    `;
  }).join("");
}

async function loadWallet() {
  try {
    const wallet = await apiRequest("/wallet");

    if (demoBalanceEl) {
      demoBalanceEl.textContent = formatBRL(wallet.demoBalance);
    }

    // Saldo real fica fixo em zero no modo sandbox.
    if (realBalanceEl) {
      realBalanceEl.textContent = formatBRL(0);
    }

    renderTransactions(wallet.transactions);
    renderWithdrawals(wallet.withdrawRequests);
  } catch (error) {
    console.error(error);
    alert(error.message || "Não foi possível carregar a carteira.");
  }
}

function createWalletModal() {
  let modal = document.getElementById("walletSandboxModal");

  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "walletSandboxModal";
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0,0,0,.8);
  `;

  modal.innerHTML = `
    <div style="
      width: 100%;
      max-width: 400px;
      padding: 22px;
      border-radius: 16px;
      background: #11151d;
      color: white;
      border: 1px solid #444;
    ">
      <h2 id="sandboxModalTitle">Carteira DEMO</h2>
      <p id="sandboxModalDescription">
        Esta operação é apenas uma simulação. Nenhum dinheiro real será movimentado.
      </p>

      <label for="sandboxAmount">Valor demonstrativo (R$)</label>
      <input
        id="sandboxAmount"
        type="number"
        min="1"
        max="10000"
        step="0.01"
        placeholder="Ex.: 25,00"
        style="
          display: block;
          box-sizing: border-box;
          width: 100%;
          margin: 10px 0 16px;
          padding: 12px;
        "
      >

      <div style="display:flex;gap:10px">
        <button id="sandboxConfirm" type="button">CONFIRMAR SIMULAÇÃO</button>
        <button id="sandboxCancel" type="button">CANCELAR</button>
      </div>

      <p style="font-size:12px;color:#bbb;margin-top:14px">
        Modo sandbox · Sem Pix real · Sem transferência
      </p>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", event => {
    if (event.target === modal) closeSandboxModal();
  });

  modal.querySelector("#sandboxCancel").addEventListener("click", closeSandboxModal);

  return modal;
}

let currentSandboxAction = null;

function openModal(type) {
  const modal = createWalletModal();
  const title = modal.querySelector("#sandboxModalTitle");
  const description = modal.querySelector("#sandboxModalDescription");
  const confirmButton = modal.querySelector("#sandboxConfirm");
  const amountInput = modal.querySelector("#sandboxAmount");

  currentSandboxAction = type === "withdraw" ? "withdraw" : "deposit";

  if (currentSandboxAction === "withdraw") {
    title.textContent = "Saque DEMO";
    description.textContent =
      "Você vai criar uma solicitação de saque simulada. Nenhum dinheiro será enviado.";
    confirmButton.textContent = "SIMULAR SAQUE";
  } else {
    title.textContent = "Adicionar saldo DEMO";
    description.textContent =
      "Você vai adicionar moedas demonstrativas. Não é um pagamento real.";
    confirmButton.textContent = "ADICIONAR DEMO";
  }

  amountInput.value = "";
  modal.style.display = "flex";

  confirmButton.onclick = submitSandboxAction;
}

function closeSandboxModal() {
  const modal = document.getElementById("walletSandboxModal");
  if (modal) modal.style.display = "none";
}

async function submitSandboxAction() {
  const modal = document.getElementById("walletSandboxModal");
  const amountInput = modal.querySelector("#sandboxAmount");
  const confirmButton = modal.querySelector("#sandboxConfirm");
  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    alert("Digite um valor entre R$ 0,01 e R$ 10.000,00.");
    return;
  }

  confirmButton.disabled = true;

  try {
    if (currentSandboxAction === "withdraw") {
      const result = await apiRequest("/demo/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount })
      });

      alert(result.message);
    } else {
      const result = await apiRequest("/demo/deposit", {
        method: "POST",
        body: JSON.stringify({ amount })
      });

      alert(result.message);
    }

    closeSandboxModal();
    await loadWallet();
  } catch (error) {
    alert(error.message || "Não foi possível concluir a simulação.");
  } finally {
    confirmButton.disabled = false;
  }
}

// Mantém compatibilidade com os botões onclick do HTML.
window.openModal = openModal;

document.addEventListener("DOMContentLoaded", loadWallet);



let state=null;
async function api(path,body){const r=await fetch(path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||"Erro");return d}
async function load(){state=await api("/api/state");render()} 
function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");document.getElementById("menu").classList.remove("open"); if(id==="wallet"||id==="missions"||id==="ranking"||id==="profile")render()}
function toggleMenu(){document.getElementById("menu").classList.toggle("open")}
function render(){if(!state)return;const p=state.player;
["walletCoins","gameCoins"].forEach(id=>document.getElementById(id).textContent=p.coins);
document.getElementById("profileName").textContent=p.name;document.getElementById("levelText").textContent="Nível "+p.level;document.getElementById("statLevel").textContent=p.level;document.getElementById("statLevels").textContent=p.completedLevels.length;document.getElementById("statAch").textContent=p.achievements?.length||0;
const need=p.level*250;document.getElementById("xpBar").style.width=Math.min(100,p.xp/need*100)+"%";
document.getElementById("txList").innerHTML=state.transactions.map(t=>`<div class="row"><span>${t.description}<small>${new Date(t.createdAt).toLocaleString("pt-BR")} · ${t.status}</small></span><b>${t.amount>0?"+":""}${t.amount} 🪙</b></div>`).join("")||'<p class="muted">Sem histórico.</p>';
document.getElementById("withdrawList").innerHTML=state.withdrawals.map(w=>`<div class="row"><span>${w.amount} 🪙 · ${w.method}<small>${new Date(w.createdAt).toLocaleString("pt-BR")}</small></span><b>${w.status}</b></div>`).join("")||'<p class="muted">Nenhuma solicitação.</p>';
document.getElementById("missionsList").innerHTML=state.missions.map(m=>{const done=p.completedMissions.includes(m.id);return `<div class="mission"><div class="mission-top"><div><b>${m.title}</b><p class="muted">${m.description}</p></div><span class="tag">+${m.reward} 🪙</span></div><button ${done?"disabled":""} onclick="claim('${m.id}')">${done?"✓ Resgatada":"Resgatar recompensa"}</button></div>`}).join("");
document.getElementById("rankList").innerHTML=state.leaderboard.map((x,i)=>`<div class="row"><span>#${i+1} 🥷 ${x.name}</span><b>Nv.${x.level} · ${x.coins} 🪙</b></div>`).join("");
}
async function startGame(){show("game");document.getElementById("levelLabel").textContent="FASE "+Math.min(10,state.player.completedLevels.length+1)}
async function collectReward(){try{state=(await api("/api/collect",{amount:25})).player;const s=await api("/api/state");state=s;render();flash("25 moedas virtuais coletadas!")}catch(e){flash(e.message)}}
async function completeLevel(){try{const level=Math.min(10,state.player.completedLevels.length+1);await api("/api/complete-level",{level});state=await api("/api/state");render();document.getElementById("levelLabel").textContent="FASE "+Math.min(10,state.player.completedLevels.length+1);flash("Fase concluída! Recompensa virtual adicionada.")}catch(e){flash(e.message)}}
function move(dir){const el=document.getElementById("player");let x=parseInt(getComputedStyle(el).left)||80;x=Math.max(10,Math.min(420,x+dir*35));el.style.left=x+"px"}
function jump(){const el=document.getElementById("player");el.style.transform="translateY(-100px)";setTimeout(()=>el.style.transform="",350)}
function attack(){const e=document.getElementById("enemy");e.style.transform="translateX(35px) rotate(15deg)";setTimeout(()=>e.style.transform="",220);flash("Ataque executado!")}
function dodge(){const el=document.getElementById("player");el.style.transform="translateX(70px) scale(.8)";setTimeout(()=>el.style.transform="",250)}
async function claim(id){try{await api("/api/claim-mission",{id});state=await api("/api/state");render();flash("Recompensa da missão adicionada.")}catch(e){flash(e.message)}}
async function daily(){try{const d=await api("/api/daily");state=await api("/api/state");render();flash(d.claimed?"Bônus diário resgatado!":"Bônus de hoje já foi resgatado.")}catch(e){flash(e.message)}}
function openModal(type){const c=document.getElementById("modalContent");if(type==="deposit")c.innerHTML=`<p class="eyebrow">DEMONSTRAÇÃO</p><h2>Adicionar moedas</h2><p class="notice">Esta tela não processa pagamento real. Ela registra uma simulação.</p><label>Valor demonstrativo</label><input id="amount" type="number" min="1" placeholder="Ex.: 50"><label>Método</label><select id="method"><option>Pix (simulação)</option><option>Cartão (simulação)</option></select><button class="primary" onclick="deposit()">CONFIRMAR SIMULAÇÃO</button>`;else c.innerHTML=`<p class="eyebrow">DEMONSTRAÇÃO</p><h2>Solicitar saque</h2><p class="notice">As moedas não têm valor monetário. Nenhum dinheiro real será enviado.</p><label>Moedas virtuais</label><input id="amount" type="number" min="1" max="${state.player.coins}" placeholder="Máx. ${state.player.coins}"><label>Chave/identificador</label><input id="method" placeholder="Ex.: chave-pix-demo"><button class="primary" onclick="withdraw()">SOLICITAR (SIMULAÇÃO)</button>`;document.getElementById("modal").classList.add("open")}
function closeModal(){document.getElementById("modal").classList.remove("open")}
async function deposit(){try{const amount=Number(document.getElementById("amount").value);const method=document.getElementById("method").value;const d=await api("/api/deposit-demo",{amount,method});closeModal();state=await api("/api/state");render();flash(d.notice)}catch(e){flash(e.message)}}
async function withdraw(){try{const amount=Number(document.getElementById("amount").value);const method=document.getElementById("method").value;const d=await api("/api/withdraw-demo",{amount,method});closeModal();state=await api("/api/state");render();flash(d.notice)}catch(e){flash(e.message)}}
function flash(msg){let x=document.getElementById("flash");if(!x){x=document.createElement("div");x.id="flash";x.style.cssText="position:fixed;left:50%;bottom:25px;transform:translateX(-50%);background:#171c28;border:1px solid #d8a73d;color:#fff;padding:13px 17px;border-radius:12px;z-index:99;max-width:90%;text-align:center";document.body.appendChild(x)}x.textContent=msg;x.style.display="block";clearTimeout(window.ft);window.ft=setTimeout(()=>x.style.display="none",3200)}
load();
