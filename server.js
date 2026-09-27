const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = fs.existsSync(path.join(DATA_DIR, "db.json"))
  ? path.join(DATA_DIR, "db.json")
  : path.join(ROOT, "db.json");

const SANDBOX = true;

/* =========================
   BANCO INICIAL
========================= */

const initial = {
  mode: "SANDBOX",

  players: [
    {
      id: "player-1",
      name: "Shadow",
      level: 1,
      xp: 0,

      // Moedas virtuais do jogo
      coins: 250,

      // Saldo financeiro separado
      // No sandbox permanece zero.
      realBalance: 0,

      completedMissions: [],
      completedLevels: [],
      achievements: [],
      inventory: [],

      createdAt: new Date().toISOString()
    }
  ],

  transactions: [
    {
      id: "tx-1",
      playerId: "player-1",
      type: "reward",
      amount: 250,
      description: "Bônus inicial",
      status: "Concluído",
      mode: "SANDBOX",
      createdAt: new Date().toISOString()
    }
  ],

  withdrawals: [],
  deposits: [],
  webhookEvents: [],

  missions: [
    {
      id: "m1",
      title: "Primeiro passo",
      description: "Complete a fase 1",
      reward: 100,
      goal: "level",
      target: 1
    },
    {
      id: "m2",
      title: "Caçador de moedas",
      description: "Colete 50 moedas",
      reward: 75,
      goal: "coinsCollected",
      target: 50
    },
    {
      id: "m3",
      title: "Ninja diário",
      description: "Entre no jogo e reivindique o bônus",
      reward: 50,
      goal: "daily",
      target: 1
    }
  ]
};

/* =========================
   BANCO
========================= */

function ensureDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(initial, null, 2),
      "utf8"
    );
  }
}

function db() {
  ensureDB();

  const data = JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8")
  );

  // Garante estruturas importantes
  data.mode = "SANDBOX";

  if (!Array.isArray(data.players)) {
    data.players = [];
  }

  if (!Array.isArray(data.transactions)) {
    data.transactions = [];
  }

  if (!Array.isArray(data.withdrawals)) {
    data.withdrawals = [];
  }

  if (!Array.isArray(data.deposits)) {
    data.deposits = [];
  }

  if (!Array.isArray(data.webhookEvents)) {
    data.webhookEvents = [];
  }

  return data;
}

function save(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/* =========================
   RESPOSTAS HTTP
========================= */

function send(res, status, data, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });

  if (type === "application/json") {
    res.end(JSON.stringify(data));
  } else {
    res.end(data);
  }
}

/* =========================
   BODY JSON
========================= */

function body(req) {
  return new Promise((resolve, reject) => {
    let content = "";

    req.on("data", chunk => {
      content += chunk;
    });

    req.on("end", () => {
      if (!content) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(content));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });

    req.on("error", reject);
  });
}

/* =========================
   JOGADOR
========================= */

function playerFrom(data, id = "player-1") {
  return data.players.find(
    player => player.id === id
  );
}

/* =========================
   TRANSAÇÕES
========================= */

function addTransaction(
  data,
  player,
  type,
  amount,
  description,
  status = "Concluído"
) {
  data.transactions.unshift({
    id: crypto.randomUUID(),
    playerId: player.id,
    type,
    amount: Number(amount),
    description,
    status,
    mode: "SANDBOX",
    createdAt: new Date().toISOString()
  });
}

/* =========================
   RECOMPENSA
========================= */

function grantCoins(
  data,
  player,
  amount,
  description
) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return;
  }

  player.coins += value;

  addTransaction(
    data,
    player,
    "reward",
    value,
    description
  );
}

/* =========================
   XP
========================= */

function xpForLevel(level) {
  return level * 250;
}

/* =========================
   API
========================= */

async function api(req, res, url) {
  const data = db();

  const player = playerFrom(data);

  if (!player) {
    return send(res, 500, {
      error: "Jogador não encontrado."
    });
  }

  /* =========================
     STATUS DO SERVIDOR
  ========================= */

  if (
    req.method === "GET" &&
    url === "/api/status"
  ) {
    return send(res, 200, {
      status: "online",
      mode: "SANDBOX",
      realMoneyEnabled: false,
      realBalance: 0
    });
  }

  /* =========================
     CARTEIRA
  ========================= */

  if (
    req.method === "GET" &&
    url === "/api/wallet"
  ) {
    return send(res, 200, {
      mode: "SANDBOX",

      demoBalance: Number(player.coins || 0),

      // Sempre zero no sandbox
      realBalance: 0,

      transactions: data.transactions
        .filter(
          item =>
            item.playerId === player.id
        )
        .slice(0, 30),

      withdrawals: data.withdrawals
        .filter(
          item =>
            item.playerId === player.id
        )
        .slice(0, 30),

      deposits: data.deposits
        .filter(
          item =>
            item.playerId === player.id
        )
        .slice(0, 30)
    });
  }

  /* =========================
     ESTADO DO JOGO
  ========================= */

  if (
    req.method === "GET" &&
    url === "/api/state"
  ) {
    return send(res, 200, {
      mode: "SANDBOX",

      player,

      missions: data.missions,

      transactions: data.transactions
        .filter(
          item =>
            item.playerId === player.id
        )
        .slice(0, 30),

      withdrawals: data.withdrawals
        .filter(
          item =>
            item.playerId === player.id
        ),

      deposits: data.deposits
        .filter(
          item =>
            item.playerId === player.id
        ),

      leaderboard: data.players
        .map(item => ({
          name: item.name,
          level: item.level,
          coins: item.coins
        }))
        .sort(
          (a, b) =>
            b.level - a.level ||
            b.coins - a.coins
        )
    });
  }

  /* =========================
     BÔNUS DIÁRIO
  ========================= */

  if (
    req.method === "POST" &&
    url === "/api/daily"
  ) {
    const day =
      new Date()
        .toISOString()
        .slice(0, 10);

    const already = data.transactions.some(
      item =>
        item.playerId === player.id &&
        item.type === "daily" &&
        item.createdAt.slice(0, 10) === day
    );

    if (!already) {
      player.coins += 50;

      addTransaction(
        data,
        player,
        "daily",
        50,
        "Bônus diário"
      );

      save(data);
    }

    return send(res, 200, {
      ok: true,
      claimed: !already,
      player
    });
  }

  /* =========================
     COMPLETAR FASE
  ========================= */

  if (
    req.method === "POST" &&
    url === "/api/complete-level"
  ) {
    const b = await body(req);

    const level = Number(
      b.level || 1
    );

    if (
      !Number.isInteger(level) ||
      level < 1 ||
      level > 10
    ) {
      return send(res, 400, {
        error: "Fase inválida."
      });
    }

    if (
      !player.completedLevels.includes(level)
    ) {
      player.completedLevels.push(level);

      player.xp += 100;

      grantCoins(
        data,
        player,
        100 + level * 10,
        `Recompensa da fase ${level}`
      );

      while (
        player.xp >=
        xpForLevel(player.level)
      ) {
        player.xp -=
          xpForLevel(player.level);

        player.level++;
      }

      save(data);
    }

    return send(res, 200, {
      ok: true,
      player
    });
  }

  /* =========================
     COLETAR MOEDAS
  ========================= */

  if (
    req.method === "POST" &&
    url === "/api/collect"
  ) {
    const b = await body(req);

    let amount = Number(
      b.amount || 0
    );

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      amount = 0;
    }

    // Limite por requisição
    amount = Math.min(amount, 100);

    player.coinsCollected =
      (player.coinsCollected || 0) +
      amount;

    player.coins += amount;

    addTransaction(
      data,
      player,
      "coin",
      amount,
      "Moedas coletadas na fase"
    );

    save(data);

    return send(res, 200, {
      ok: true,
      player
    });
  }

  /* =========================
     RESGATAR MISSÃO
  ========================= */

  if (
    req.method === "POST" &&
    url === "/api/claim-mission"
  ) {
    const b = await body(req);

    const mission = data.missions.find(
      item => item.id === b.id
    );

    if (!mission) {
      return send(res, 404, {
        error: "Missão não encontrada."
      });
    }

    if (
      player.completedMissions.includes(
        mission.id
      )
    ) {
      return send(res, 400, {
        error: "Missão já resgatada."
      });
    }

    let completed = false;

    if (mission.goal === "level") {
      completed =
        player.completedLevels.includes(
          mission.target
        );
    }

    if (
      mission.goal ===
      "coinsCollected"
    ) {
      completed =
        (player.coinsCollected || 0) >=
        mission.target;
    }

    if (mission.goal === "daily") {
      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      completed =
        data.transactions.some(
          item =>
            item.playerId === player.id &&
            item.type === "daily" &&
            item.createdAt.slice(0, 10) ===
              today
        );
    }

    if (!completed) {
      return send(res, 400, {
        error:
          "Missão ainda não concluída."
      });
    }

    player.completedMissions.push(
      mission.id
    );

    grantCoins(
      data,
      player,
      mission.reward,
      `Missão: ${mission.title}`
    );

    save(data);

    return send(res, 200, {
      ok: true,
      player
    });
  }

  /* =========================
     ADICIONAR DEMO
  ========================= */

  if (
    req.method === "POST" &&
    url === "/api/demo/deposit"
  ) {
    const b = await body(req);

    let amount = Number(
      b.amount || 0
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 10000
    ) {
      return send(res, 400, {
        error:
          "Informe um valor DEMO válido."
      });
    }

    player.coins += amount;

    data.deposits.unshift({
      id: crypto.randomUUID(),
      playerId: player.id,
      amount,
      method: "SANDBOX",
      status: "SIMULAÇÃO",
      mode: "SANDBOX",
      createdAt:
        new Date().toISOString()
    });

    addTransaction(
      data,
      player,
      "DEMO_DEPOSIT",
      amount,
      "Adição de saldo demonstrativo",
      "SIMULAÇÃO"
    );

    save(data);

    return send(res, 200, {
      ok: true,
      message:
        "Saldo DEMO adicionado.",
      demoBalance: player.coins,
      realBalance: 0
    });
  }

  /* =========================
     SAQUE DEMO
  ========================= */

  if (
    req.method === "POST" &&
    url === "/api/demo/withdraw"
  ) {
    const b = await body(req);

    const amount = Number(
      b.amount || 0
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 10000
    ) {
      return send(res, 400, {
        error:
          "Informe um valor válido."
      });
    }

    if (amount > player.coins) {
      return send(res, 400, {
        error:
          "Saldo DEMO insuficiente."
      });
    }

    player.coins -= amount;

    const request = {
      id: crypto.randomUUID(),
      playerId: player.id,
      amount,
      method: "SANDBOX",
      status: "SIMULADO",
      mode: "SANDBOX",
      createdAt:
        new Date().toISOString()
    };

    data.withdrawals.unshift(
      request
    );

    addTransaction(
      data,
      player,
      "DEMO_WITHDRAW",
      -amount,
      "Saque demonstrativo",
      "SIMULAÇÃO"
    );

    save(data);

    return send(res, 200, {
      ok: true,

      message:
        "Saque registrado apenas como simulação. Nenhum dinheiro real foi enviado.",

      demoBalance: player.coins,

      realBalance: 0,

      withdrawal: request
    });
  }

  /* =========================
     BLOQUEIO DE DINHEIRO REAL
  ========================= */

  if (
    url.startsWith("/api/real")
  ) {
    return send(res, 403, {
      ok: false,
      mode: "SANDBOX",

      error:
        "Operações com dinheiro real estão desativadas no sandbox."
    });
  }

  /* =========================
     ADMIN
  ========================= */

  if (
    req.method === "GET" &&
    url === "/api/admin"
  ) {
    return send(res, 200, {
      mode: "SANDBOX",
      players: data.players,
      transactions: data.transactions,
      withdrawals: data.withdrawals,
      deposits: data.deposits,
      missions: data.missions
    });
  }

  /* =========================
     STATUS DO SAQUE DEMO
  ========================= */

  if (
    req.method === "POST" &&
    url ===
      "/api/admin/withdrawal-status"
  ) {
    const b = await body(req);

    const withdrawal =
      data.withdrawals.find(
        item => item.id === b.id
      );

    if (!withdrawal) {
      return send(res, 404, {
        error:
          "Solicitação não encontrada."
      });
    }

    const validStatuses = [
      "Pendente — SIMULAÇÃO",
      "Processando — SIMULAÇÃO",
      "Concluído — SIMULAÇÃO"
    ];

    if (
      !validStatuses.includes(
        b.status
      )
    ) {
      return send(res, 400, {
        error: "Status inválido."
      });
    }

    withdrawal.status =
      b.status;

    save(data);

    return send(res, 200, {
      ok: true,
      withdrawal
    });
  }

  return send(res, 404, {
    error: "Rota não encontrada."
  });
}

/* =========================
   ARQUIVOS DO SITE
========================= */

function serve(req, res) {
  let url = decodeURIComponent(
    req.url.split("?")[0]
  );

  if (url === "/") {
    url = "/index.html";
  }

  if (url === "/admin") {
    url = "/admin.html";
  }

  const candidates = [];

  if (fs.existsSync(PUBLIC)) {
    candidates.push(
      path.normalize(
        path.join(PUBLIC, url)
      )
    );
  }

  candidates.push(
    path.normalize(
      path.join(ROOT, url)
    )
  );

  const file = candidates.find(
    item => fs.existsSync(item)
  );

  if (
    !file ||
    !file.startsWith(ROOT)
  ) {
    return send(
      res,
      404,
      "Not found",
      "text/plain"
    );
  }

  fs.readFile(
    file,
    (error, content) => {
      if (error) {
        return send(
          res,
          404,
          "Not found",
          "text/plain"
        );
      }

      const extension =
        path.extname(file);

      const types = {
        ".html":
          "text/html; charset=utf-8",

        ".js":
          "text/javascript; charset=utf-8",

        ".css":
          "text/css; charset=utf-8",

        ".json":
          "application/json; charset=utf-8",

        ".svg":
          "image/svg+xml",

        ".png":
          "image/png",

        ".jpg":
          "image/jpeg",

        ".jpeg":
          "image/jpeg"
      };

      send(
        res,
        200,
        content,
        types[extension] ||
          "application/octet-stream"
      );
    }
  );
}

/* =========================
   INICIAR SERVIDOR
========================= */

ensureDB();

http
  .createServer(
    async (req, res) => {
      try {
        const url =
          req.url.split("?")[0];

        if (
          url.startsWith("/api/")
        ) {
          await api(
            req,
            res,
            url
          );
        } else {
          serve(req, res);
        }
      } catch (error) {
        console.error(error);

        send(res, 500, {
          error:
            "Erro interno do servidor."
        });
      }
    }
  )
  .listen(
    PORT,
    () => {
      console.log(
        `Shadow Knight Ninja SANDBOX rodando na porta ${PORT}`
      );
    }
  );
