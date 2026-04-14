// ══════════════════════════════════════════════════
// EMIR.COM — Backend v3
// Favoritos · Tracking · Relatórios Financeiros
// ══════════════════════════════════════════════════
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const axios     = require('axios');
const cheerio   = require('cheerio');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── MIDDLEWARE ─────────────────────────────────────
app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { erro: 'Muitas tentativas. Aguarda 15 minutos.' }
});

// ── AUTH MIDDLEWARES ───────────────────────────────
function authAdmin(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Token em falta.' });
  try { req.admin = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ erro: 'Token inválido.' }); }
}

function authCliente(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Sessão expirada.' });
  try { req.cliente = jwt.verify(token, process.env.JWT_CLIENT_SECRET); next(); }
  catch { res.status(401).json({ erro: 'Sessão expirada.' }); }
}

// ── HELPERS ────────────────────────────────────────
async function getRate() {
  try {
    const { data } = await axios.get('https://cambio.ao/api/taxas', { timeout: 4000 });
    const eur = (data?.data || data || []).find(t =>
      (t.moeda || t.currency || '').toUpperCase() === 'EUR'
    );
    const r = parseFloat(eur?.venda || eur?.compra || eur?.rate || 0);
    if (r > 0) return r;
    throw new Error('campo não encontrado');
  } catch {
    try {
      const { data } = await axios.get('https://api.exchangerate-api.com/v4/latest/EUR', { timeout: 4000 });
      return data.rates.AOA || Number(process.env.EUR_AOA_FALLBACK);
    } catch { return Number(process.env.EUR_AOA_FALLBACK) || 905; }
  }
}

async function gerarNumero() {
  const ano = new Date().getFullYear();
  const { count } = await supabase.from('encomendas').select('*', { count: 'exact', head: true });
  return `EMIR-${ano}-${String((count || 0) + 1).padStart(4, '0')}`;
}

async function notificarWpp(enc) {
  const { ZAPI_INSTANCE_ID: iid, ZAPI_TOKEN: tok, ADMIN_WHATSAPP: num } = process.env;
  if (!iid || !tok) return;
  const icons = { Pendente:'🟡', Confirmado:'🟢', Pago:'💰', 'Em Trânsito':'🚚', Entregue:'✅', Cancelado:'❌' };
  const msg = [
    `${icons[enc.estado]||'📦'} *Nova Encomenda — Emir.com*`,
    ``, `*Nº:* ${enc.numero}`, `*Produto:* ${enc.produto_nome || enc.produto_url}`,
    `*Qty:* ${enc.quantidade}`, `*Total:* ${Math.round(enc.total_kz).toLocaleString('pt-AO')} Kz`,
    `*Pagamento:* ${enc.metodo_pag}`, ``,
    `*Cliente:* ${enc.entrega_nome}`, `*Tel:* ${enc.entrega_tel}`,
    `*Província:* ${enc.entrega_prov}${enc.entrega_mun ? ', ' + enc.entrega_mun : ''}`,
    `*Morada:* ${enc.entrega_morada}`,
    enc.notas ? `*Notas:* ${enc.notas}` : null
  ].filter(Boolean).join('\n');
  try {
    await axios.post(
      `https://api.z-api.io/instances/${iid}/token/${tok}/send-text`,
      { phone: num, message: msg }, { timeout: 8000 }
    );
  } catch (e) { console.error('[WPP]', e.message); }
}

// ── PRICE SCRAPER ──────────────────────────────────
async function scrapeProduct(url) {
  const result = { titulo: null, preco: null, imagem: null, moeda: 'EUR' };
  try {
    const { data: html } = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    const $ = cheerio.load(html);
    result.titulo = ($('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() || $('title').text().trim() || '').replace(/\s+/g, ' ').slice(0, 120) || null;
    result.imagem = $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') || null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (result.preco) return;
      try {
        const json = JSON.parse($(el).html());
        const objs = Array.isArray(json) ? json : [json];
        for (const obj of objs) {
          const oferta = obj?.offers || obj?.Offers;
          const price  = obj?.price || oferta?.price || oferta?.lowPrice;
          const curr   = obj?.priceCurrency || oferta?.priceCurrency;
          if (price && parseFloat(price) > 0) {
            result.preco = parseFloat(String(price).replace(',', '.'));
            if (curr) result.moeda = curr.toUpperCase();
            break;
          }
        }
      } catch {}
    });
    if (!result.preco) {
      const mp = $('meta[property="og:price:amount"]').attr('content') ||
        $('meta[name="price"]').attr('content') || $('meta[itemprop="price"]').attr('content');
      if (mp) {
        result.preco = parseFloat(mp.replace(',', '.'));
        const mc = $('meta[property="og:price:currency"]').attr('content');
        if (mc) result.moeda = mc.toUpperCase();
      }
    }
    if (!result.preco) {
      const sels = ['[data-testid="price"]', '[class*="price"]:not([class*="original"])', '[itemprop="price"]', '.price', '#price', '.product-price', '.current-price'];
      for (const sel of sels) {
        const txt = $(sel).first().text().trim();
        const m = txt.match(/([\d]+[.,][\d]{2})/);
        if (m) { const v = parseFloat(m[1].replace(',', '.')); if (v > 0 && v < 100000) { result.preco = v; break; } }
      }
    }
    if (result.preco && result.moeda !== 'EUR') {
      try {
        const { data } = await axios.get(`https://api.exchangerate-api.com/v4/latest/${result.moeda}`, { timeout: 3000 });
        const toEur = data.rates?.EUR;
        if (toEur) { result.preco = +(result.preco * toEur).toFixed(2); result.moeda = 'EUR'; }
      } catch {}
    }
  } catch (e) { console.error('[SCRAPE]', e.message); }
  return result;
}

// ════════════════════════════════════════════════
// ROTAS PÚBLICAS
// ════════════════════════════════════════════════

app.get('/', (_, res) => res.json({ status: 'ok', app: 'Emir Backend v3' }));

app.get('/api/cambio', async (_, res) => {
  const rate = await getRate();
  res.json({ eur_aoa: rate });
});

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ erro: 'URL em falta.' });
  res.json(await scrapeProduct(url));
});

app.get('/api/produtos', async (req, res) => {
  const { categoria } = req.query;
  let q = supabase.from('produtos').select('*').eq('ativo', true).order('id');
  if (categoria && categoria !== 'Todos') q = q.eq('categoria', categoria);
  const { data, error } = await q;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// ── TRACKING PÚBLICO (sem login) ──────────────────
app.get('/api/tracking/:numero', async (req, res) => {
  const { data, error } = await supabase.from('encomendas')
    .select('numero, produto_nome, produto_img, quantidade, total_kz, estado, tracking_code, entrega_prov, criado_em, atualizado_em, estados_historico(estado, nota, criado_em)')
    .eq('numero', req.params.numero.toUpperCase())
    .single();
  if (error || !data) return res.status(404).json({ erro: 'Encomenda não encontrada. Verifica o número.' });
  // ordena histórico cronológico
  if (data.estados_historico) {
    data.estados_historico.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  }
  res.json(data);
});

// ════════════════════════════════════════════════
// AUTH — CLIENTES
// ════════════════════════════════════════════════

app.post('/api/clientes/registar', loginLimiter, async (req, res) => {
  const { nome, email, telefone, password } = req.body;
  if (!nome || !email || !password || password.length < 6)
    return res.status(400).json({ erro: 'Preenche todos os campos. Password mínimo 6 caracteres.' });
  const { data: existe } = await supabase.from('clientes').select('id').eq('email', email.toLowerCase()).single();
  if (existe) return res.status(409).json({ erro: 'Este email já está registado.' });
  const hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('clientes')
    .insert({ nome, email: email.toLowerCase(), telefone, password_hash: hash })
    .select('id, nome, email, telefone').single();
  if (error) return res.status(500).json({ erro: error.message });
  const token = jwt.sign({ id: data.id, email: data.email, nome: data.nome },
    process.env.JWT_CLIENT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, cliente: data });
});

app.post('/api/clientes/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ erro: 'Email e password obrigatórios.' });
  const { data: cliente } = await supabase.from('clientes').select('*').eq('email', email.toLowerCase()).single();
  if (!cliente || !await bcrypt.compare(password, cliente.password_hash))
    return res.status(401).json({ erro: 'Email ou password incorrectos.' });
  if (!cliente.ativo) return res.status(403).json({ erro: 'Conta suspensa. Contacta o suporte.' });
  const token = jwt.sign({ id: cliente.id, email: cliente.email, nome: cliente.nome },
    process.env.JWT_CLIENT_SECRET, { expiresIn: '30d' });
  res.json({ token, cliente: { id: cliente.id, nome: cliente.nome, email: cliente.email, telefone: cliente.telefone } });
});

app.get('/api/clientes/perfil', authCliente, async (req, res) => {
  const { data, error } = await supabase.from('clientes')
    .select('id, nome, email, telefone, criado_em').eq('id', req.cliente.id).single();
  if (error) return res.status(404).json({ erro: 'Não encontrado.' });
  res.json(data);
});

app.patch('/api/clientes/perfil', authCliente, async (req, res) => {
  const { nome, telefone } = req.body;
  const { data, error } = await supabase.from('clientes')
    .update({ nome, telefone }).eq('id', req.cliente.id)
    .select('id, nome, email, telefone').single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

app.get('/api/clientes/moradas', authCliente, async (req, res) => {
  const { data } = await supabase.from('moradas')
    .select('*').eq('cliente_id', req.cliente.id).order('predefinida', { ascending: false });
  res.json(data || []);
});

app.post('/api/clientes/moradas', authCliente, async (req, res) => {
  const { nome, telefone, provincia, municipio, morada, predefinida } = req.body;
  if (!nome || !telefone || !provincia || !morada)
    return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });
  if (predefinida)
    await supabase.from('moradas').update({ predefinida: false }).eq('cliente_id', req.cliente.id);
  const { data, error } = await supabase.from('moradas')
    .insert({ cliente_id: req.cliente.id, nome, telefone, provincia, municipio, morada, predefinida: predefinida || false })
    .select().single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json(data);
});

app.get('/api/clientes/encomendas', authCliente, async (req, res) => {
  const { data, error } = await supabase.from('encomendas')
    .select('*, estados_historico(estado, criado_em)')
    .eq('cliente_id', req.cliente.id)
    .order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data || []);
});

app.get('/api/clientes/encomendas/:numero', authCliente, async (req, res) => {
  const { data, error } = await supabase.from('encomendas')
    .select('*, estados_historico(estado, nota, criado_em)')
    .eq('numero', req.params.numero)
    .eq('cliente_id', req.cliente.id).single();
  if (error) return res.status(404).json({ erro: 'Não encontrada.' });
  if (data.estados_historico)
    data.estados_historico.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  res.json(data);
});

// ════════════════════════════════════════════════
// FAVORITOS
// ════════════════════════════════════════════════

// Listar favoritos do cliente
app.get('/api/clientes/favoritos', authCliente, async (req, res) => {
  const { data, error } = await supabase.from('favoritos')
    .select('*, produtos(nome, imagem_url, preco_eur, loja)')
    .eq('cliente_id', req.cliente.id)
    .order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data || []);
});

// Adicionar favorito (produto do catálogo)
app.post('/api/clientes/favoritos', authCliente, async (req, res) => {
  const { produto_id, produto_url, produto_nome, produto_img, preco_eur, loja } = req.body;
  if (!produto_id && !produto_url)
    return res.status(400).json({ erro: 'Indica produto_id ou produto_url.' });
  const fav = { cliente_id: req.cliente.id, produto_url, produto_nome, produto_img, preco_eur, loja };
  if (produto_id) fav.produto_id = produto_id;
  const { data, error } = await supabase.from('favoritos').insert(fav).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ erro: 'Já está nos teus favoritos.' });
    return res.status(500).json({ erro: error.message });
  }
  res.status(201).json(data);
});

// Remover favorito
app.delete('/api/clientes/favoritos/:id', authCliente, async (req, res) => {
  const { error } = await supabase.from('favoritos')
    .delete().eq('id', req.params.id).eq('cliente_id', req.cliente.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ sucesso: true });
});

// Verificar se produto está nos favoritos
app.get('/api/clientes/favoritos/check/:produto_id', authCliente, async (req, res) => {
  const { data } = await supabase.from('favoritos')
    .select('id').eq('cliente_id', req.cliente.id)
    .eq('produto_id', req.params.produto_id).single();
  res.json({ favorito: !!data, id: data?.id || null });
});

// ════════════════════════════════════════════════
// ENCOMENDAS (checkout)
// ════════════════════════════════════════════════

app.post('/api/encomendas', async (req, res) => {
  const {
    produto_url, produto_nome, produto_img, quantidade = 1,
    preco_eur, metodo_pag,
    entrega_nome, entrega_tel, entrega_prov, entrega_mun, entrega_morada, notas,
    cliente_token
  } = req.body;
  if (!produto_url || !entrega_nome || !entrega_tel || !entrega_prov || !entrega_morada || !metodo_pag)
    return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });
  let cliente_id = null;
  if (cliente_token) {
    try { cliente_id = jwt.verify(cliente_token, process.env.JWT_CLIENT_SECRET).id; } catch {}
  }
  const rate  = await getRate();
  const base  = (preco_eur || 0) * rate;
  const taxa  = base * 0.08;
  const total = base + taxa + 5000;
  const numero = await gerarNumero();
  const enc = {
    numero, cliente_id, produto_url, produto_nome, produto_img,
    quantidade, preco_eur: preco_eur || null,
    cambio_usado: rate, base_kz: base, taxa_kz: taxa, envio_kz: 5000, total_kz: total,
    metodo_pag, estado: 'Pendente',
    entrega_nome, entrega_tel, entrega_prov, entrega_mun, entrega_morada, notas
  };
  const { data, error } = await supabase.from('encomendas').insert(enc).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  await notificarWpp(data);
  res.status(201).json({ sucesso: true, numero: data.numero,
    mensagem: `Encomenda ${data.numero} registada! Receberás confirmação pelo WhatsApp em breve.` });
});

// ════════════════════════════════════════════════
// ADMIN — AUTH
// ════════════════════════════════════════════════

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const { data: admin } = await supabase.from('admins').select('*').eq('email', email?.toLowerCase()).single();
  if (!admin || !await bcrypt.compare(password, admin.password_hash))
    return res.status(401).json({ erro: 'Credenciais inválidas.' });
  const token = jwt.sign({ id: admin.id, email: admin.email, nome: admin.nome },
    process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, nome: admin.nome });
});

// ════════════════════════════════════════════════
// ADMIN — DASHBOARD
// ════════════════════════════════════════════════

app.get('/api/admin/dashboard', authAdmin, async (_, res) => {
  const [total, pendentes, pagas, entregues, clientes] = await Promise.all([
    supabase.from('encomendas').select('*', { count: 'exact', head: true }),
    supabase.from('encomendas').select('*', { count: 'exact', head: true }).eq('estado', 'Pendente'),
    supabase.from('encomendas').select('*', { count: 'exact', head: true }).in('estado', ['Pago', 'Em Processamento', 'Em Trânsito']),
    supabase.from('encomendas').select('*', { count: 'exact', head: true }).eq('estado', 'Entregue'),
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
  ]);
  const { data: rec } = await supabase.from('encomendas').select('total_kz').eq('estado', 'Entregue');
  const receita = (rec || []).reduce((s, e) => s + (e.total_kz || 0), 0);
  const { data: recentes } = await supabase.from('encomendas').select('*').order('criado_em', { ascending: false }).limit(8);
  res.json({
    total: total.count || 0, pendentes: pendentes.count || 0,
    em_curso: pagas.count || 0, entregues: entregues.count || 0,
    clientes: clientes.count || 0, receita_kz: Math.round(receita), recentes: recentes || []
  });
});

// ════════════════════════════════════════════════
// ADMIN — ENCOMENDAS
// ════════════════════════════════════════════════

app.get('/api/admin/encomendas', authAdmin, async (req, res) => {
  const { estado, page = 1, limit = 30, search } = req.query;
  const from = (page - 1) * limit;
  let q = supabase.from('encomendas').select('*', { count: 'exact' })
    .order('criado_em', { ascending: false }).range(from, from + Number(limit) - 1);
  if (estado && estado !== 'Todos') q = q.eq('estado', estado);
  if (search) q = q.or(`numero.ilike.%${search}%,entrega_nome.ilike.%${search}%,entrega_tel.ilike.%${search}%`);
  const { data, error, count } = await q;
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ encomendas: data || [], total: count || 0 });
});

app.get('/api/admin/encomendas/:id', authAdmin, async (req, res) => {
  const { data, error } = await supabase.from('encomendas')
    .select('*, estados_historico(estado, nota, criado_em)')
    .eq('id', req.params.id).single();
  if (error) return res.status(404).json({ erro: 'Não encontrada.' });
  if (data.estados_historico)
    data.estados_historico.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  res.json(data);
});

app.patch('/api/admin/encomendas/:id/estado', authAdmin, async (req, res) => {
  const { estado, nota, tracking_code } = req.body;
  const validos = ['Pendente', 'Confirmado', 'Pago', 'Em Processamento', 'Em Trânsito', 'Entregue', 'Cancelado'];
  if (!validos.includes(estado)) return res.status(400).json({ erro: 'Estado inválido.' });
  const update = { estado };
  if (tracking_code !== undefined) update.tracking_code = tracking_code;
  const { data, error } = await supabase.from('encomendas')
    .update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  if (nota) await supabase.from('estados_historico').insert({ encomenda_id: req.params.id, estado, nota });
  res.json({ sucesso: true, encomenda: data });
});

// ════════════════════════════════════════════════
// ADMIN — RELATÓRIOS FINANCEIROS
// ════════════════════════════════════════════════

// Relatório por período (query: periodo=hoje|semana|mes|ano|custom, de=YYYY-MM-DD, ate=YYYY-MM-DD)
app.get('/api/admin/relatorios/financeiro', authAdmin, async (req, res) => {
  const { periodo = 'mes', de, ate } = req.query;
  const now = new Date();

  let dataInicio, dataFim;
  if (periodo === 'custom' && de && ate) {
    dataInicio = new Date(de); dataFim = new Date(ate); dataFim.setHours(23, 59, 59);
  } else if (periodo === 'hoje') {
    dataInicio = new Date(now.toDateString()); dataFim = new Date();
  } else if (periodo === 'semana') {
    dataInicio = new Date(now); dataInicio.setDate(now.getDate() - 7); dataFim = new Date();
  } else if (periodo === 'ano') {
    dataInicio = new Date(now.getFullYear(), 0, 1); dataFim = new Date();
  } else {
    // mes (default)
    dataInicio = new Date(now.getFullYear(), now.getMonth(), 1); dataFim = new Date();
  }

  const { data: encs } = await supabase.from('encomendas')
    .select('id, numero, total_kz, base_kz, taxa_kz, envio_kz, estado, metodo_pag, criado_em, entrega_prov')
    .gte('criado_em', dataInicio.toISOString())
    .lte('criado_em', dataFim.toISOString())
    .order('criado_em', { ascending: false });

  const lista = encs || [];

  // Totais gerais
  const totalEnc   = lista.length;
  const entregues  = lista.filter(e => e.estado === 'Entregue');
  const canceladas = lista.filter(e => e.estado === 'Cancelado');
  const pendentes  = lista.filter(e => e.estado === 'Pendente');
  const emCurso    = lista.filter(e => !['Entregue','Cancelado','Pendente'].includes(e.estado));

  const receita      = entregues.reduce((s, e) => s + (e.total_kz || 0), 0);
  const taxas_emir   = entregues.reduce((s, e) => s + (e.taxa_kz || 0), 0);
  const valor_envio  = entregues.reduce((s, e) => s + (e.envio_kz || 0), 0);
  const ticket_medio = entregues.length ? receita / entregues.length : 0;

  // Por método de pagamento
  const por_metodo = {};
  lista.forEach(e => {
    const m = e.metodo_pag || 'Outro';
    if (!por_metodo[m]) por_metodo[m] = { count: 0, total: 0 };
    por_metodo[m].count++;
    por_metodo[m].total += e.total_kz || 0;
  });

  // Por província
  const por_provincia = {};
  lista.forEach(e => {
    const p = e.entrega_prov || 'Desconhecida';
    if (!por_provincia[p]) por_provincia[p] = { count: 0, total: 0 };
    por_provincia[p].count++;
    por_provincia[p].total += e.total_kz || 0;
  });

  // Evolução diária (agrupa por data)
  const por_dia = {};
  lista.forEach(e => {
    const dia = e.criado_em.slice(0, 10);
    if (!por_dia[dia]) por_dia[dia] = { encomendas: 0, receita: 0 };
    por_dia[dia].encomendas++;
    if (e.estado === 'Entregue') por_dia[dia].receita += e.total_kz || 0;
  });
  const evolucao = Object.entries(por_dia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({ dia, ...v }));

  res.json({
    periodo: { inicio: dataInicio.toISOString(), fim: dataFim.toISOString() },
    resumo: {
      total_encomendas: totalEnc,
      entregues: entregues.length,
      em_curso: emCurso.length,
      pendentes: pendentes.length,
      canceladas: canceladas.length,
      taxa_conversao: totalEnc ? Math.round((entregues.length / totalEnc) * 100) : 0,
    },
    financeiro: {
      receita_total_kz:  Math.round(receita),
      taxas_emir_kz:     Math.round(taxas_emir),
      valor_envio_kz:    Math.round(valor_envio),
      ticket_medio_kz:   Math.round(ticket_medio),
    },
    por_metodo,
    por_provincia: Object.entries(por_provincia)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([provincia, v]) => ({ provincia, ...v })),
    evolucao,
    encomendas: lista.slice(0, 50)  // primeiras 50 para tabela
  });
});

// ════════════════════════════════════════════════
// ADMIN — CLIENTES
// ════════════════════════════════════════════════

app.get('/api/admin/clientes', authAdmin, async (req, res) => {
  const { search, page = 1, limit = 30 } = req.query;
  const from = (page - 1) * limit;
  let q = supabase.from('clientes').select('id, nome, email, telefone, ativo, criado_em', { count: 'exact' })
    .order('criado_em', { ascending: false }).range(from, from + Number(limit) - 1);
  if (search) q = q.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error, count } = await q;
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ clientes: data || [], total: count || 0 });
});

app.patch('/api/admin/clientes/:id/ativo', authAdmin, async (req, res) => {
  const { ativo } = req.body;
  const { data, error } = await supabase.from('clientes').update({ ativo }).eq('id', req.params.id)
    .select('id, nome, ativo').single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// ════════════════════════════════════════════════
// ADMIN — PRODUTOS
// ════════════════════════════════════════════════

app.get('/api/admin/produtos', authAdmin, async (_, res) => {
  const { data } = await supabase.from('produtos').select('*').order('id');
  res.json(data || []);
});

app.post('/api/admin/produtos', authAdmin, async (req, res) => {
  const { nome, categoria, loja, preco_eur, imagem_url, descricao } = req.body;
  if (!nome || !loja || !preco_eur) return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });
  const { data, error } = await supabase.from('produtos')
    .insert({ nome, categoria: categoria || 'Outros', loja, preco_eur, imagem_url, descricao }).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json(data);
});

app.patch('/api/admin/produtos/:id', authAdmin, async (req, res) => {
  const { data, error } = await supabase.from('produtos').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

app.delete('/api/admin/produtos/:id', authAdmin, async (req, res) => {
  await supabase.from('produtos').update({ ativo: false }).eq('id', req.params.id);
  res.json({ sucesso: true });
});

// ════════════════════════════════════════════════
// ADMIN — PASSWORD
// ════════════════════════════════════════════════

app.post('/api/admin/password', authAdmin, async (req, res) => {
  const { password_atual, password_nova } = req.body;
  if (!password_nova || password_nova.length < 8)
    return res.status(400).json({ erro: 'Password nova mínimo 8 caracteres.' });
  const { data: admin } = await supabase.from('admins').select('password_hash').eq('id', req.admin.id).single();
  if (!await bcrypt.compare(password_atual, admin.password_hash))
    return res.status(401).json({ erro: 'Password actual incorrecta.' });
  const hash = await bcrypt.hash(password_nova, 10);
  await supabase.from('admins').update({ password_hash: hash }).eq('id', req.admin.id);
  res.json({ sucesso: true });
});

// ── START ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Emir Backend v3 — porta ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL}\n`);
});
