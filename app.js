const API = "/api";

let gameState = null;

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

async function api(url, options = {}) {
  const response = await fetch(API + url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Erro na operação.");
  }

  return data;
}

async function carregarJogo() {
  try {
    const data = await api("/state");

    gameState = data.player;

    atualizarInterface(data.player);
    carregarHistorico(data.transactions);
    carregarSaques(data.withdrawals);

  } catch (error) {
    console.error(error);
  }
}

function atualizarInterface(player) {
  const coins = document.getElementById("walletCoins");
  const demo = document.getElementById("demoBalance");
  const real = document.getElementById("realBalance");

  if (coins) {
    coins.textContent = player.coins;
  }

  if (demo) {
    demo.textContent = money(player.coins);
  }

  if (real) {
    real.textContent = money(0);
  }
}

function carregarHistorico(transactions) {
  const area = document.getElementById("rewardHistory");

  if (!area) return;

  if (!transactions || transactions.length === 0) {
    area.innerHTML = "<p>Nenhuma movimentação.</p>";
    return;
  }

  area.innerHTML = transactions.map(item => `
    <div class="history-item">
      <strong>${item.description}</strong>
      <span>${money(item.amount)}</span>
      <small>${item.status || "Concluído"}</small>
    </div>
  `).join("");
}

function carregarSaques(withdrawals) {
  const area = document.getElementById("withdrawHistory");

  if (!area) return;

  if (!withdrawals || withdrawals.length === 0) {
    area.innerHTML = "<p>Nenhum saque simulado.</p>";
    return;
  }

  area.innerHTML = withdrawals.map(item => `
    <div class="history-item">
      <strong>Saque DEMO</strong>
      <span>${money(item.amount)}</span>
      <small>${item.status}</small>
    </div>
  `).join("");
}

/* =========================
   ADICIONAR DEMO
========================= */

async function adicionarDemo() {
  const valor = prompt(
    "Digite o valor para adicionar ao saldo DEMO:"
  );

  if (valor === null) return;

  const amount = Number(
    String(valor).replace(",", ".")
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Digite um valor válido.");
    return;
  }

  try {
    const result = await api("/demo/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount
      })
    });

    alert(result.message);

    carregarJogo();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================
   SACAR DEMO
========================= */

async function sacarDemo() {
  const valor = prompt(
    "Digite o valor do saque DEMO:"
  );

  if (valor === null) return;

  const amount = Number(
    String(valor).replace(",", ".")
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Digite um valor válido.");
    return;
  }

  try {
    const result = await api("/demo/withdraw", {
      method: "POST",
      body: JSON.stringify({
        amount
      })
    });

    alert(result.message);

    carregarJogo();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================
   BÔNUS DIÁRIO
========================= */

async function bonusDiario() {
  try {
    const result = await api("/daily", {
      method: "POST"
    });

    if (result.claimed) {
      alert("🎁 Bônus diário recebido!");
    } else {
      alert("Você já recebeu o bônus hoje.");
    }

    carregarJogo();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================
   COMPATIBILIDADE COM HTML
========================= */

window.adicionarDemo = adicionarDemo;
window.sacarDemo = sacarDemo;
window.bonusDiario = bonusDiario;

/* =========================
   INICIALIZAÇÃO
========================= */

document.addEventListener(
  "DOMContentLoaded",
  carregarJogo
);
