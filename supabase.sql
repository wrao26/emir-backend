<!DOCTYPE html>
<html lang="pt-AO">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Emir Admin — Painel</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;1,400&display=swap" rel="stylesheet">
<style>
:root {
  --navy:#0A1628; --navy2:#0F1E38; --panel:#111E33;
  --blue:#1A6BFF; --blue2:#3D84FF; --blue3:#5B9BFF;
  --white:#fff; --cream:#F5F7FA;
  --muted:rgba(255,255,255,.5); --muted2:rgba(255,255,255,.18);
  --border:rgba(255,255,255,.08); --glass:rgba(255,255,255,.04);
  --green:#25D366; --red:#E53935; --yellow:#FFB800; --orange:#FF6B35;
  --r:10px; --rx:16px;

  /* ── MUDA ISTO para o URL do teu backend no Railway ── */
  --api: ;
}
/* Fallback enquanto não configuras: usa localhost */

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:'Outfit',sans-serif;background:var(--navy);color:var(--white)}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--blue);border-radius:2px}

/* ── LOGIN ── */
#loginScreen {
  min-height:100vh; display:flex; align-items:center; justify-content:center;
  background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(26,107,255,.12), transparent 70%), var(--navy);
}
.login-card {
  width:100%; max-width:420px; background:rgba(255,255,255,.03);
  border:1px solid rgba(26,107,255,.2); border-radius:var(--rx);
  padding:48px 40px; position:relative; overflow:hidden;
}
.login-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--blue),var(--blue2),var(--blue3))}
.login-logo{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;margin-bottom:8px}
.login-logo span{color:var(--blue)}
.login-sub{font-size:.8rem;color:var(--muted);margin-bottom:36px}
.field{margin-bottom:18px}
.field label{display:block;font-size:.6rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--blue3);margin-bottom:8px}
.field input{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r);color:var(--white);font-family:'Outfit',sans-serif;font-size:.9rem;padding:13px 16px;outline:none;transition:border-color .2s}
.field input:focus{border-color:rgba(26,107,255,.5);box-shadow:0 0 0 3px rgba(26,107,255,.08)}
.field input::placeholder{color:rgba(255,255,255,.18)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:'Outfit',sans-serif;font-weight:700;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;padding:14px 28px;border-radius:var(--r);border:none;cursor:pointer;transition:all .25s;text-decoration:none}
.btn-blue{background:linear-gradient(135deg,var(--blue),var(--blue2));color:var(--white);box-shadow:0 6px 24px rgba(26,107,255,.3);width:100%}
.btn-blue:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(26,107,255,.45)}
.btn-sm{padding:8px 18px;font-size:.65rem}
.btn-ghost{background:var(--glass);border:1px solid var(--border);color:var(--muted)}
.btn-ghost:hover{border-color:rgba(26,107,255,.4);color:var(--blue3)}
.btn-red{background:rgba(229,57,53,.15);border:1px solid rgba(229,57,53,.3);color:#ff8a80}
.btn-red:hover{background:rgba(229,57,53,.25)}
.btn-green{background:linear-gradient(135deg,var(--green),#1da851);color:var(--white)}
.login-err{font-size:.78rem;color:#ff6b6b;margin-top:14px;text-align:center;display:none}
.login-err.show{display:block}

/* ── APP ── */
#app{display:none;height:100vh;flex-direction:column}
#app.show{display:flex}

/* ── TOPBAR ── */
.topbar{height:60px;background:var(--navy2);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 28px;gap:16px;flex-shrink:0;position:relative}
.topbar::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--blue),var(--blue2),transparent)}
.topbar-logo{font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:700;margin-right:auto}
.topbar-logo span{color:var(--blue)}
.topbar-admin{font-size:.78rem;color:var(--muted)}
.topbar-logout{background:none;border:1px solid rgba(229,57,53,.3);color:rgba(229,57,53,.7);border-radius:6px;padding:6px 14px;font-family:'Outfit',sans-serif;font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
.topbar-logout:hover{border-color:var(--red);color:var(--red)}

/* ── MAIN LAYOUT ── */
.main{display:flex;flex:1;overflow:hidden}

/* ── SIDEBAR ── */
.sidebar{width:220px;background:var(--panel);border-right:1px solid var(--border);padding:24px 0;display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.nav-item{display:flex;align-items:center;gap:12px;padding:12px 24px;font-size:.78rem;font-weight:600;color:var(--muted);cursor:pointer;transition:all .2s;border-left:2px solid transparent;letter-spacing:.04em}
.nav-item:hover{color:var(--white);background:rgba(26,107,255,.06)}
.nav-item.active{color:var(--white);background:rgba(26,107,255,.1);border-left-color:var(--blue)}
.nav-item .icon{font-size:1rem;width:20px;text-align:center}
.nav-section{font-size:.52rem;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.2);padding:20px 24px 8px}

/* ── CONTENT ── */
.content{flex:1;overflow-y:auto;padding:32px}
.page{display:none}.page.active{display:block}

/* ── CARDS ── */
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
.stat-card{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--rx);padding:24px;position:relative;overflow:hidden;transition:border-color .2s}
.stat-card:hover{border-color:rgba(26,107,255,.25)}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,var(--blue))}
.stat-value{font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:700;line-height:1;margin-bottom:6px}
.stat-label{font-size:.65rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}

/* ── TABLE ── */
.table-wrap{background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:var(--rx);overflow:hidden}
.table-head{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid var(--border)}
.table-head h3{font-size:1rem;font-weight:700}
.filters{display:flex;gap:8px}
.filter-btn{font-size:.62rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:7px 14px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:all .2s}
.filter-btn.active,.filter-btn:hover{background:var(--blue);color:var(--white);border-color:var(--blue)}
table{width:100%;border-collapse:collapse}
th{font-size:.58rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--muted2);padding:14px 20px;text-align:left;border-bottom:1px solid var(--border)}
td{padding:16px 20px;font-size:.82rem;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(26,107,255,.04)}
.badge{display:inline-block;font-size:.58rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:4px}
.badge-pendente{background:rgba(255,184,0,.12);color:#FFB800;border:1px solid rgba(255,184,0,.3)}
.badge-confirmado{background:rgba(26,107,255,.12);color:var(--blue3);border:1px solid rgba(26,107,255,.3)}
.badge-transito{background:rgba(255,107,53,.12);color:var(--orange);border:1px solid rgba(255,107,53,.3)}
.badge-entregue{background:rgba(37,211,102,.12);color:var(--green);border:1px solid rgba(37,211,102,.3)}
.badge-cancelado{background:rgba(229,57,53,.12);color:#ff6b6b;border:1px solid rgba(229,57,53,.3)}
.numero{font-family:monospace;font-size:.78rem;color:var(--blue3)}
.empty-state{text-align:center;padding:64px 24px;color:var(--muted)}
.empty-state .big{font-size:3rem;margin-bottom:12px}

/* ── MODAL ── */
.overlay{position:fixed;inset:0;z-index:500;background:rgba(6,11,20,.9);backdrop-filter:blur(12px);display:none;align-items:center;justify-content:center;padding:20px}
.overlay.open{display:flex}
.modal{background:var(--navy2);border:1px solid rgba(26,107,255,.2);border-radius:var(--rx);width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
.modal::before{content:'';display:block;height:2px;background:linear-gradient(90deg,var(--blue),var(--blue2))}
.modal-head{padding:24px 28px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)}
.modal-head h3{font-size:1.1rem;font-weight:700}
.modal-close{background:none;border:1px solid var(--border);color:var(--muted);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.9rem;transition:all .2s}
.modal-close:hover{border-color:var(--red);color:var(--red)}
.modal-body{padding:24px 28px 28px}
.detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.84rem}
.detail-row:last-child{border-bottom:none}
.detail-row .key{color:var(--muted);font-weight:500}
.detail-row .val{font-weight:600;text-align:right;max-width:60%}
.select-estado{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r);color:var(--white);font-family:'Outfit',sans-serif;font-size:.85rem;padding:10px 14px;width:100%;outline:none;cursor:pointer;transition:border-color .2s}
.select-estado:focus{border-color:rgba(26,107,255,.5)}
.select-estado option{background:var(--navy2)}

/* ── TOAST ── */
.toast{position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:14px 20px;font-size:.82rem;font-weight:600;min-width:260px;box-shadow:0 12px 40px rgba(0,0,0,.4);transform:translateY(80px);opacity:0;transition:all .35s cubic-bezier(.34,1.56,.64,1)}
.toast.show{transform:none;opacity:1}
.toast.ok{border-color:rgba(37,211,102,.4);color:var(--green)}
.toast.err{border-color:rgba(229,57,53,.4);color:#ff6b6b}

/* ── PRODUTOS PAGE ── */
.prod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-top:24px}
.prod-admin-card{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--rx);overflow:hidden;transition:border-color .2s}
.prod-admin-card:hover{border-color:rgba(26,107,255,.25)}
.prod-admin-img{height:160px;object-fit:cover;width:100%;display:block}
.prod-admin-body{padding:16px}
.prod-admin-name{font-weight:700;font-size:.9rem;margin-bottom:4px}
.prod-admin-store{font-size:.62rem;color:var(--blue3);font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
.prod-admin-price{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--blue2);margin-bottom:12px}
.prod-admin-actions{display:flex;gap:8px}
.inactive-overlay{opacity:.4;filter:grayscale(.8)}

/* ── FORM ── */
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:900px){
  .stat-grid{grid-template-columns:1fr 1fr}
  .sidebar{display:none}
  .form-row{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- ── LOGIN ── -->
<div id="loginScreen">
  <div class="login-card">
    <div class="login-logo">Emir<span>.</span>Admin</div>
    <div class="login-sub">Painel de gestão · Acesso restrito</div>
    <div class="field"><label>Email</label><input type="email" id="loginEmail" placeholder="admin@emir.com" autocomplete="email"></div>
    <div class="field"><label>Password</label><input type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password"></div>
    <button class="btn btn-blue" onclick="doLogin()">Entrar no Painel</button>
    <div class="login-err" id="loginErr"></div>
  </div>
</div>

<!-- ── APP ── -->
<div id="app">
  <!-- Topbar -->
  <div class="topbar">
    <div class="topbar-logo">Emir<span>.</span>Admin</div>
    <span class="topbar-admin" id="topbarName"></span>
    <button class="topbar-logout" onclick="doLogout()">Sair</button>
  </div>
  <div class="main">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="nav-section">Gestão</div>
      <div class="nav-item active" onclick="showPage('dashboard')"><span class="icon">📊</span>Dashboard</div>
      <div class="nav-item" onclick="showPage('encomendas')"><span class="icon">📦</span>Encomendas</div>
      <div class="nav-item" onclick="showPage('produtos')"><span class="icon">🛍️</span>Produtos</div>
      <div class="nav-section">Conta</div>
      <div class="nav-item" onclick="showPage('password')"><span class="icon">🔒</span>Password</div>
    </div>
    <!-- Content -->
    <div class="content">

      <!-- DASHBOARD -->
      <div class="page active" id="page-dashboard">
        <h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;margin-bottom:8px">Bom dia 👋</h2>
        <p style="color:var(--muted);font-size:.85rem;margin-bottom:28px">Resumo da actividade do Emir.com</p>
        <div class="stat-grid">
          <div class="stat-card" style="--accent:var(--blue)"><div class="stat-value" id="s-total">—</div><div class="stat-label">Total Encomendas</div></div>
          <div class="stat-card" style="--accent:var(--yellow)"><div class="stat-value" style="color:var(--yellow)" id="s-pendentes">—</div><div class="stat-label">Pendentes</div></div>
          <div class="stat-card" style="--accent:var(--green)"><div class="stat-value" style="color:var(--green)" id="s-entregues">—</div><div class="stat-label">Entregues</div></div>
          <div class="stat-card" style="--accent:var(--blue2)"><div class="stat-value" style="color:var(--blue2);font-size:1.6rem" id="s-receita">—</div><div class="stat-label">Receita Total (Kz)</div></div>
        </div>
        <div class="table-wrap">
          <div class="table-head"><h3>Encomendas Recentes</h3><button class="btn btn-sm btn-ghost" onclick="showPage('encomendas')">Ver todas →</button></div>
          <table><thead><tr><th>Nº</th><th>Cliente</th><th>Produto</th><th>Total</th><th>Estado</th><th>Data</th></tr></thead>
          <tbody id="tbRecentes"></tbody></table>
        </div>
      </div>

      <!-- ENCOMENDAS -->
      <div class="page" id="page-encomendas">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;flex-wrap:wrap;gap:16px">
          <div><h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;margin-bottom:4px">Encomendas</h2><p style="color:var(--muted);font-size:.82rem">Todas as encomendas recebidas</p></div>
        </div>
        <div class="table-wrap">
          <div class="table-head">
            <h3 id="enc-count">— encomendas</h3>
            <div class="filters" id="estadoFilters">
              <button class="filter-btn active" onclick="filtrarEncomendas('Todos',this)">Todas</button>
              <button class="filter-btn" onclick="filtrarEncomendas('Pendente',this)">Pendente</button>
              <button class="filter-btn" onclick="filtrarEncomendas('Confirmado',this)">Confirmado</button>
              <button class="filter-btn" onclick="filtrarEncomendas('Em Trânsito',this)">Em Trânsito</button>
              <button class="filter-btn" onclick="filtrarEncomendas('Entregue',this)">Entregue</button>
            </div>
          </div>
          <table><thead><tr><th>Nº</th><th>Cliente</th><th>Província</th><th>Produto</th><th>Total</th><th>Pagamento</th><th>Estado</th><th>Data</th><th></th></tr></thead>
          <tbody id="tbEncomendas"></tbody></table>
        </div>
      </div>

      <!-- PRODUTOS -->
      <div class="page" id="page-produtos">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;gap:16px">
          <div><h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;margin-bottom:4px">Produtos</h2><p style="color:var(--muted);font-size:.82rem">Catálogo em destaque no site</p></div>
          <button class="btn btn-blue btn-sm" onclick="openAddProd()">+ Adicionar Produto</button>
        </div>
        <div class="prod-grid" id="prodAdminGrid"></div>
      </div>

      <!-- PASSWORD -->
      <div class="page" id="page-password">
        <h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;margin-bottom:24px">Alterar Password</h2>
        <div style="max-width:420px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--rx);padding:32px">
          <div class="field"><label>Password Actual</label><input type="password" id="passAtual" placeholder="••••••••"></div>
          <div class="field"><label>Nova Password</label><input type="password" id="passNova" placeholder="Mínimo 8 caracteres"></div>
          <div class="field"><label>Confirmar Nova Password</label><input type="password" id="passConf" placeholder="Repetir nova password"></div>
          <button class="btn btn-blue" onclick="mudarPass()">Actualizar Password</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ── MODAL ENCOMENDA ── -->
<div class="overlay" id="encModal" onclick="closeEncModal(event)">
  <div class="modal">
    <div class="modal-head"><h3 id="encModalTitle">Encomenda</h3><button class="modal-close" onclick="closeEncModal()">✕</button></div>
    <div class="modal-body" id="encModalBody"></div>
  </div>
</div>

<!-- ── MODAL PRODUTO ── -->
<div class="overlay" id="prodModal" onclick="closeProdModal(event)">
  <div class="modal">
    <div class="modal-head"><h3 id="prodModalTitle">Produto</h3><button class="modal-close" onclick="closeProdModal()">✕</button></div>
    <div class="modal-body">
      <input type="hidden" id="prodId">
      <div class="form-row">
        <div class="field"><label>Nome *</label><input type="text" id="prodNome" placeholder="Nike Air Max 270"></div>
        <div class="field"><label>Categoria *</label>
          <select id="prodCat" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r);color:var(--white);font-family:'Outfit',sans-serif;font-size:.88rem;padding:13px 14px;outline:none">
            <option>Moda</option><option>Calçado</option><option>Tecnologia</option><option>Casa</option><option>Beleza</option><option>Gaming</option><option>Infantil</option><option>Outros</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label>Loja *</label><input type="text" id="prodLoja" placeholder="Nike.com"></div>
        <div class="field"><label>Preço (EUR) *</label><input type="number" id="prodEur" placeholder="99.99" step="0.01"></div>
      </div>
      <div class="field"><label>URL da Imagem</label><input type="url" id="prodImg" placeholder="https://images.unsplash.com/..."></div>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="closeProdModal()">Cancelar</button>
        <button class="btn btn-blue btn-sm" onclick="saveProd()">Guardar</button>
      </div>
    </div>
  </div>
</div>

<!-- ── TOAST ── -->
<div class="toast" id="toast"></div>

<script>
// ══ CONFIG ══════════════════════════════════
// Muda para o URL do teu servidor Railway depois do deploy
// Ex: 'https://emir-backend.up.railway.app'
const API = window.EMIR_API || 'http://localhost:3000';

let TOKEN = localStorage.getItem('emir_token');
let ADMIN_NOME = localStorage.getItem('emir_nome');
let encEstadoFiltro = 'Todos';

// ══ INIT ════════════════════════════════════
if (TOKEN) startApp();

// ══ TOAST ═══════════════════════════════════
function toast(msg, tipo='ok') {
  const t = document.getElementById('toast');
  t.textContent = (tipo==='ok' ? '✅ ' : '❌ ') + msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ══ AUTH ═════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const err   = document.getElementById('loginErr');
  err.classList.remove('show');
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro; err.classList.add('show'); return; }
    TOKEN = data.token;
    ADMIN_NOME = data.nome;
    localStorage.setItem('emir_token', TOKEN);
    localStorage.setItem('emir_nome', ADMIN_NOME);
    startApp();
  } catch(e) {
    err.textContent = 'Erro de ligação ao servidor. Verifica o URL da API.';
    err.classList.add('show');
  }
}
document.getElementById('loginPass')?.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

function doLogout() {
  localStorage.removeItem('emir_token');
  localStorage.removeItem('emir_nome');
  TOKEN = null;
  document.getElementById('app').classList.remove('show');
  document.getElementById('loginScreen').style.display = 'flex';
}

function startApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').classList.add('show');
  document.getElementById('topbarName').textContent = ADMIN_NOME || 'Admin';
  loadDashboard();
}

// ══ FETCH HELPER ════════════════════════════
async function api(path, opts={}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${TOKEN}`, ...(opts.headers||{}) }
  });
  if (res.status === 401) { doLogout(); return null; }
  return res.json();
}

// ══ NAVIGATION ══════════════════════════════
function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(x => { if(x.textContent.toLowerCase().includes(p.replace('_',' ').toLowerCase())) x.classList.add('active'); });
  if(p==='dashboard') loadDashboard();
  if(p==='encomendas') loadEncomendas();
  if(p==='produtos') loadProdutos();
}

// ══ BADGES ══════════════════════════════════
function badge(estado) {
  const map = {
    'Pendente':'pendente','Confirmado':'confirmado',
    'Em Trânsito':'transito','Entregue':'entregue','Cancelado':'cancelado'
  };
  return `<span class="badge badge-${map[estado]||'pendente'}">${estado}</span>`;
}
function fmtKz(v) { return v ? Math.round(v).toLocaleString('pt-AO')+' Kz' : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('pt-AO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'; }

// ══ DASHBOARD ═══════════════════════════════
async function loadDashboard() {
  const d = await api('/api/admin/dashboard');
  if (!d) return;
  document.getElementById('s-total').textContent    = d.total;
  document.getElementById('s-pendentes').textContent = d.pendentes;
  document.getElementById('s-entregues').textContent  = d.entregues;
  document.getElementById('s-receita').textContent   = Math.round(d.receita_kz).toLocaleString('pt-AO');

  const enc = await api('/api/admin/encomendas?limit=5');
  const tb = document.getElementById('tbRecentes');
  if (!enc?.encomendas?.length) {
    tb.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="big">📭</div>Sem encomendas ainda</div></td></tr>`;
    return;
  }
  tb.innerHTML = enc.encomendas.map(e => `
    <tr style="cursor:pointer" onclick="openEnc(${e.id})">
      <td class="numero">${e.numero}</td>
      <td>${e.cliente_nome}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${e.produto_nome || '—'}</td>
      <td style="color:var(--blue2);font-weight:700">${fmtKz(e.total_kz)}</td>
      <td>${badge(e.estado)}</td>
      <td style="color:var(--muted);font-size:.75rem">${fmtDate(e.criado_em)}</td>
    </tr>`).join('');
}

// ══ ENCOMENDAS ══════════════════════════════
async function loadEncomendas(estado='Todos') {
  const q = estado==='Todos' ? '' : `&estado=${encodeURIComponent(estado)}`;
  const data = await api(`/api/admin/encomendas?limit=50${q}`);
  const tb = document.getElementById('tbEncomendas');
  document.getElementById('enc-count').textContent = `${data?.total||0} encomendas`;
  if (!data?.encomendas?.length) {
    tb.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="big">📭</div>Nenhuma encomenda${estado!=='Todos'?' com estado "'+estado+'"':''}</div></td></tr>`;
    return;
  }
  tb.innerHTML = data.encomendas.map(e => `
    <tr style="cursor:pointer" onclick="openEnc(${e.id})">
      <td class="numero">${e.numero}</td>
      <td><div style="font-weight:600">${e.cliente_nome}</div><div style="font-size:.7rem;color:var(--muted)">${e.cliente_tel}</div></td>
      <td style="color:var(--muted)">${e.cliente_prov}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${e.produto_nome||'Ver link'}</td>
      <td style="color:var(--blue2);font-weight:700">${fmtKz(e.total_kz)}</td>
      <td style="color:var(--muted);font-size:.75rem">${e.metodo_pag}</td>
      <td>${badge(e.estado)}</td>
      <td style="color:var(--muted);font-size:.72rem">${fmtDate(e.criado_em)}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openEnc(${e.id})">Ver</button></td>
    </tr>`).join('');
}
function filtrarEncomendas(estado, btn) {
  document.querySelectorAll('#estadoFilters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  encEstadoFiltro = estado;
  loadEncomendas(estado);
}

// ══ MODAL ENCOMENDA ══════════════════════════
async function openEnc(id) {
  const e = await api(`/api/admin/encomendas/${id}`);
  if (!e) return;
  document.getElementById('encModalTitle').textContent = e.numero;
  document.getElementById('encModalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      ${[
        ['Cliente', e.cliente_nome],
        ['Telefone', e.cliente_tel],
        ['Província', e.cliente_prov + (e.cliente_mun?', '+e.cliente_mun:'')],
        ['Morada', e.cliente_morada],
        ['Pagamento', e.metodo_pag],
        ['Data', fmtDate(e.criado_em)],
      ].map(([k,v])=>`<div><div style="font-size:.58rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--blue3);margin-bottom:4px">${k}</div><div style="font-size:.86rem;font-weight:600">${v||'—'}</div></div>`).join('')}
    </div>
    <div style="background:rgba(26,107,255,.06);border:1px solid rgba(26,107,255,.15);border-radius:var(--r);padding:16px;margin-bottom:20px">
      <div style="font-size:.58rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--blue3);margin-bottom:8px">Produto</div>
      <div style="font-weight:700;margin-bottom:4px">${e.produto_nome||'—'}</div>
      <a href="${e.produto_url}" target="_blank" style="font-size:.75rem;color:var(--blue3);word-break:break-all">${e.produto_url}</a>
      <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
        <span style="font-size:.75rem;color:var(--muted)">Qty: <strong style="color:var(--white)">${e.quantidade}</strong></span>
        <span style="font-size:.75rem;color:var(--muted)">Base: <strong style="color:var(--white)">${fmtKz(e.taxa_kz/0.08)}</strong></span>
        <span style="font-size:.75rem;color:var(--muted)">Taxa 8%: <strong style="color:var(--white)">${fmtKz(e.taxa_kz)}</strong></span>
        <span style="font-size:.75rem;color:var(--muted)">Envio: <strong style="color:var(--white)">${fmtKz(e.envio_kz)}</strong></span>
        <span style="font-size:.82rem;font-weight:800;color:var(--blue2)">Total: ${fmtKz(e.total_kz)}</span>
      </div>
    </div>
    ${e.notas?`<div style="background:rgba(255,184,0,.05);border:1px solid rgba(255,184,0,.2);border-radius:var(--r);padding:14px;margin-bottom:20px;font-size:.82rem;color:rgba(255,184,0,.9)">📝 ${e.notas}</div>`:''}
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="font-size:.62rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--blue3)">Alterar Estado:</div>
      <select class="select-estado" id="selEstado" onchange="updateEstado(${e.id},this.value)">
        ${['Pendente','Confirmado','Em Trânsito','Entregue','Cancelado'].map(s=>`<option${s===e.estado?' selected':''}>${s}</option>`).join('')}
      </select>
      <a href="https://wa.me/${e.cliente_tel.replace(/\D/g,'')}" target="_blank" class="btn btn-sm btn-green">💬 WhatsApp</a>
    </div>`;
  document.getElementById('encModal').classList.add('open');
}
async function updateEstado(id, estado) {
  const data = await api(`/api/admin/encomendas/${id}/estado`, { method:'PATCH', body: JSON.stringify({ estado }) });
  if (data?.sucesso) { toast('Estado actualizado!'); loadDashboard(); loadEncomendas(encEstadoFiltro); }
  else toast('Erro ao actualizar estado.', 'err');
}
function closeEncModal(e) { if(!e||e.target===document.getElementById('encModal')) document.getElementById('encModal').classList.remove('open'); }

// ══ PRODUTOS ════════════════════════════════
async function loadProdutos() {
  const data = await api('/api/admin/produtos');
  const g = document.getElementById('prodAdminGrid');
  if (!data?.length) { g.innerHTML = `<div class="empty-state"><div class="big">🛍️</div>Sem produtos. Adiciona o primeiro!</div>`; return; }
  g.innerHTML = data.map(p => `
    <div class="prod-admin-card${p.ativo?'':' inactive-overlay'}">
      <img class="prod-admin-img" src="${p.imagem_url||'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=200&q=80&fit=crop'}" alt="${p.nome}" loading="lazy">
      <div class="prod-admin-body">
        <div class="prod-admin-name">${p.nome}</div>
        <div class="prod-admin-store">${p.loja} · ${p.categoria}</div>
        <div class="prod-admin-price">€${p.preco_eur}</div>
        <div class="prod-admin-actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditProd(${p.id})">✏️ Editar</button>
          <button class="btn btn-sm btn-red" onclick="toggleProd(${p.id},${p.ativo})">${p.ativo?'Desactivar':'Activar'}</button>
        </div>
      </div>
    </div>`).join('');
}
function openAddProd() {
  document.getElementById('prodId').value='';
  ['prodNome','prodLoja','prodImg'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('prodEur').value='';
  document.getElementById('prodModalTitle').textContent='Novo Produto';
  document.getElementById('prodModal').classList.add('open');
}
async function openEditProd(id) {
  const data = await api('/api/admin/produtos');
  const p = data?.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('prodId').value  = p.id;
  document.getElementById('prodNome').value = p.nome;
  document.getElementById('prodCat').value  = p.categoria;
  document.getElementById('prodLoja').value = p.loja;
  document.getElementById('prodEur').value  = p.preco_eur;
  document.getElementById('prodImg').value  = p.imagem_url||'';
  document.getElementById('prodModalTitle').textContent = 'Editar Produto';
  document.getElementById('prodModal').classList.add('open');
}
async function saveProd() {
  const id   = document.getElementById('prodId').value;
  const body = {
    nome: document.getElementById('prodNome').value.trim(),
    categoria: document.getElementById('prodCat').value,
    loja: document.getElementById('prodLoja').value.trim(),
    preco_eur: parseFloat(document.getElementById('prodEur').value),
    imagem_url: document.getElementById('prodImg').value.trim()||null,
  };
  if (!body.nome||!body.loja||!body.preco_eur) { toast('Preenche os campos obrigatórios.','err'); return; }
  const res = id
    ? await api(`/api/admin/produtos/${id}`, { method:'PATCH', body: JSON.stringify(body) })
    : await api('/api/admin/produtos', { method:'POST', body: JSON.stringify(body) });
  if (res?.id || res?.nome) { toast(id?'Produto actualizado!':'Produto adicionado!'); closeProdModal(); loadProdutos(); }
  else toast('Erro ao guardar produto.','err');
}
async function toggleProd(id, ativo) {
  await api(`/api/admin/produtos/${id}`, { method:'PATCH', body: JSON.stringify({ ativo: !ativo }) });
  toast(ativo?'Produto desactivado.':'Produto activado!'); loadProdutos();
}
function closeProdModal(e) { if(!e||e.target===document.getElementById('prodModal')) document.getElementById('prodModal').classList.remove('open'); }

// ══ PASSWORD ═════════════════════════════════
async function mudarPass() {
  const pa=document.getElementById('passAtual').value, pn=document.getElementById('passNova').value, pc=document.getElementById('passConf').value;
  if(pn!==pc){toast('As passwords novas não coincidem.','err');return;}
  if(pn.length<8){toast('Mínimo 8 caracteres.','err');return;}
  const res=await api('/api/admin/password',{method:'POST',body:JSON.stringify({password_atual:pa,password_nova:pn})});
  if(res?.sucesso){toast('Password actualizada!');['passAtual','passNova','passConf'].forEach(id=>document.getElementById(id).value='');}
  else toast(res?.erro||'Erro ao actualizar.','err');
}
</script>
</body>
</html>
