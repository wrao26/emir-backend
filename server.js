// ══════════════════════════════════════════════
// EMIR.COM — Servidor v2
// Node.js + Express + Supabase + Resend
// ══════════════════════════════════════════════

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const axios      = require('axios');
const rateLimit  = require('express-rate-limit');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const PORT   = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

// ── SUPABASE ──────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── MIDDLEWARE ────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { erro: 'Muitas tentativas. Espera 15 minutos.' }
});

// ── ESTADOS VÁLIDOS ───────────────────────────
const ESTADOS = [
  'Pendente',
  'Cotação Enviada',
  'Pago',
  'Aguardando Compra',
  'Comprado',
  'Em Trânsito Europa',
  'Recebido na Europa',
  'Enviado para Angola',
  'Em Entrega',
  'Entregue',
  'Cancelado'
];

const ESTADO_EMOJI = {
  'Pendente':            '🟡',
  'Cotação Enviada':     '📋',
  'Pago':                '💳',
  'Aguardando Compra':   '⏳',
  'Comprado':            '🛒',
  'Em Trânsito Europa':  '🚚',
  'Recebido na Europa':  '🏭',
  'Enviado para Angola': '✈️',
  'Em Entrega':          '📦',
  'Entregue':            '✅',
  'Cancelado':           '❌'
};

// ── HELPER: AUTH ──────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ erro: 'Token em falta.' });
  try {
    req.admin = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

// ── HELPER: NÚMERO DE ENCOMENDA ───────────────
async function gerarNumeroEncomenda() {
  const ano = new Date().getFullYear();
  const { count } = await supabase
    .from('encomendas')
    .select('*', { count: 'exact', head: true });
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `EMIR-${ano}-${seq}`;
}

// ── HELPER: CÂMBIO ────────────────────────────
async function getRate() {
  try {
    const { data } = await axios.get(
      'https://api.exchangerate-api.com/v4/latest/EUR',
      { timeout: 4000 }
    );
    return data.rates.AOA || Number(process.env.EUR_AOA_FALLBACK);
  } catch {
    return Number(process.env.EUR_AOA_FALLBACK) || 1320;
  }
}

// ── HELPER: CALCULADORA DE COTAÇÃO ───────────
function calcularCotacao(preco_eur, rate) {
  const base          = preco_eur * rate;
  const frete_europa  = 15 * rate;          // ~15 EUR frete interno Europa
  const frete_angola  = 8000;               // Kz frete internacional estimado
  const impostos      = base * 0.07;        // 7% impostos/alfândega
  const comissao      = base * 0.05;        // 5% comissão Emir
  const margem        = base * 0.03;        // 3% margem cambial
  const total         = base + frete_europa + frete_angola + impostos + comissao + margem;

  return {
    base:         Math.round(base),
    frete_europa: Math.round(frete_europa),
    frete_angola: Math.round(frete_angola),
    impostos:     Math.round(impostos),
    comissao:     Math.round(comissao),
    margem:       Math.round(margem),
    total:        Math.round(total)
  };
}

// ── HELPER: EMAIL DE ESTADO AO CLIENTE ────────
async function enviarEmailEstado(encomenda) {
  if (!process.env.RESEND_API_KEY) return;
  if (!encomenda.cliente_email) return;

  const emoji  = ESTADO_EMOJI[encomenda.estado] || '📦';
  const estado = encomenda.estado;
  const num    = encomenda.numero;

  const mensagens = {
    'Pago':                'Recebemos o teu pagamento. Vamos tratar da tua encomenda!',
    'Aguardando Compra':   'A tua encomenda foi confirmada e estamos prestes a efectuar a compra.',
    'Comprado':            'Produto comprado com sucesso! Está a caminho do nosso armazém.',
    'Em Trânsito Europa':  'O teu produto está em trânsito dentro da Europa.',
    'Recebido na Europa':  'Produto recebido no nosso armazém. A preparar envio para Angola.',
    'Enviado para Angola': 'O teu produto foi enviado para Angola! Aguarda a chegada.',
    'Em Entrega':          'A tua encomenda saiu para entrega. Estaremos aí em breve!',
    'Entregue':            'Entregue com sucesso! Obrigado por escolheres o Emir.',
    'Cancelado':           'A tua encomenda foi cancelada. Contacta-nos para mais informações.',
  };

  const descricao = mensagens[estado] || `O estado da tua encomenda foi actualizado para "${estado}".`;

  try {
    await resend.emails.send({
      from:    'Emir.com <noreply@emir.com>',
      to:      encomenda.cliente_email,
      subject: `${emoji} Encomenda ${num} — ${estado}`,
      html: `
        <!DOCTYPE html>
        <html lang="pt">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#F5F7FA;font-family:'Helvetica Neue',Arial,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:40px 20px">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
                <!-- Header -->
                <tr><td style="background:#0A1628;padding:32px 40px;text-align:center">
                  <p style="margin:0;font-size:28px;font-weight:900;color:#FFFFFF;letter-spacing:-.02em">Emir<span style="color:#1A6BFF">.</span></p>
                  <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,.5);letter-spacing:.12em;text-transform:uppercase">Compra o Mundo. Paga em Kz.</p>
                </td></tr>
                <!-- Estado -->
                <tr><td style="padding:40px 40px 20px;text-align:center">
                  <p style="margin:0;font-size:48px">${emoji}</p>
                  <h1 style="margin:16px 0 8px;font-size:22px;font-weight:700;color:#0A0A0A">${estado}</h1>
                  <p style="margin:0;font-size:15px;color:#666;line-height:1.6">${descricao}</p>
                </td></tr>
                <!-- Detalhes -->
                <tr><td style="padding:0 40px 32px">
                  <table width="100%" style="background:#F5F7FA;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:20px 24px;border-bottom:1px solid #ECEEF2">
                      <p style="margin:0;font-size:11px;color:#888;letter-spacing:.1em;text-transform:uppercase">Nº de Encomenda</p>
                      <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0A0A0A">${num}</p>
                    </td></tr>
                    <tr><td style="padding:20px 24px;border-bottom:1px solid #ECEEF2">
                      <p style="margin:0;font-size:11px;color:#888;letter-spacing:.1em;text-transform:uppercase">Produto</p>
                      <p style="margin:4px 0 0;font-size:15px;color:#0A0A0A">${encomenda.produto_nome || encomenda.produto_url}</p>
                    </td></tr>
                    <tr><td style="padding:20px 24px">
                      <p style="margin:0;font-size:11px;color:#888;letter-spacing:.1em;text-transform:uppercase">Total</p>
                      <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#1A6BFF">${Math.round(encomenda.total_kz).toLocaleString('pt-AO')} Kz</p>
                    </td></tr>
                  </table>
                </td></tr>
                <!-- CTA -->
                <tr><td style="padding:0 40px 40px;text-align:center">
                  <a href="https://wa.me/244928060604" style="display:inline-block;background:#25D366;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:100px;font-size:13px;font-weight:700;letter-spacing:.08em">
                    Falar com Suporte
                  </a>
                  <p style="margin:24px 0 0;font-size:12px;color:#aaa">Emir.com · Luanda, Angola</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    });
    console.log(`[EMAIL] Enviado para ${encomenda.cliente_email} — estado: ${estado}`);
  } catch (e) {
    console.error('[EMAIL] Falha:', e.message);
  }
}

// ── HELPER: EMAIL NOVA ENCOMENDA AO ADMIN ─────
async function emailNovaEncomendaAdmin(encomenda) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) return;
  try {
    await resend.emails.send({
      from:    'Emir.com <noreply@emir.com>',
      to:      process.env.ADMIN_EMAIL,
      subject: `🛒 Nova Encomenda — ${encomenda.numero}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px">
          <h2 style="color:#0A1628">Nova Encomenda Recebida</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Nº</td><td style="font-weight:700">${encomenda.numero}</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Produto</td><td>${encomenda.produto_nome || encomenda.produto_url}</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Cliente</td><td>${encomenda.cliente_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Tel</td><td>${encomenda.cliente_tel}</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Província</td><td>${encomenda.cliente_prov}</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Total</td><td style="font-weight:700;color:#1A6BFF;font-size:18px">${Math.round(encomenda.total_kz).toLocaleString('pt-AO')} Kz</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:13px">Pagamento</td><td>${encomenda.metodo_pag}</td></tr>
          </table>
        </div>
      `
    });
  } catch (e) {
    console.error('[EMAIL ADMIN] Falha:', e.message);
  }
}

// ── HELPER: NOTIFICAÇÃO WHATSAPP (Z-API) ──────
async function notificarWhatsApp(encomenda) {
  const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ADMIN_WHATSAPP } = process.env;
  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) return;

  const emoji = ESTADO_EMOJI[encomenda.estado] || '📦';
  const msg = [
    `${emoji} *Nova Encomenda — Emir.com*`, '',
    `*Nº:* ${encomenda.numero}`,
    `*Produto:* ${encomenda.produto_nome || encomenda.produto_url}`,
    `*Total:* ${Math.round(encomenda.total_kz).toLocaleString('pt-AO')} Kz`,
    `*Cliente:* ${encomenda.cliente_nome}`,
    `*Tel:* ${encomenda.cliente_tel}`,
    `*Província:* ${encomenda.cliente_prov}`
  ].join('\n');

  try {
    await axios.post(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      { phone: ADMIN_WHATSAPP, message: msg },
      { timeout: 8000 }
    );
  } catch (e) {
    console.error('[WPP] Falha:', e.message);
  }
}


// ── HELPER: SCRAPER DE PRODUTO ────────────────
async function scrapeProduct(url) {
  try {
    // Usa allorigins como proxy CORS
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxy, { timeout: 10000 });
    const html = data.contents || '';

    let nome = null, preco = null, imagem = null, moeda = 'EUR';

    // ── NOME ──
    const nomePatterns = [
      /<meta property="og:title" content="([^"]+)"/i,
      /<meta name="title" content="([^"]+)"/i,
      /"name"\s*:\s*"([^"]{5,120})"/i,
      /<title>([^<]{5,120})<\/title>/i,
    ];
    for (const p of nomePatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].length > 4) { nome = m[1].trim().replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&quot;/g,'"'); break; }
    }

    // ── PREÇO ──
    const precoPatterns = [
      /"price"\s*:\s*"?([\d]+[.,][\d]{2})"?/i,
      /property="og:price:amount"\s+content="([\d.,]+)"/i,
      /content="([\d.,]+)"\s+property="og:price:amount"/i,
      /(?:€|EUR)\s*([\d]+[.,][\d]{2})/,
      /([\d]+[.,][\d]{2})\s*(?:€|EUR)/,
      /(?:\$|USD)\s*([\d]+[.,][\d]{2})/,
      /(?:£|GBP)\s*([\d]+[.,][\d]{2})/,
      /"priceValidUntil"[\s\S]{0,300}"price"\s*:\s*"?([\d.]+)"?/i,
    ];
    for (const p of precoPatterns) {
      const m = html.match(p);
      if (m) {
        const v = parseFloat(m[1].replace(',','.'));
        if (v > 0 && v < 100000) { preco = v; break; }
      }
    }

    // Detectar moeda
    if (html.match(/property="og:price:currency"\s+content="USD"/i) || html.match(/"\$"/)) moeda = 'USD';
    else if (html.match(/property="og:price:currency"\s+content="GBP"/i) || html.match(/"£"/)) moeda = 'GBP';

    // ── IMAGEM ──
    const imgPatterns = [
      /<meta property="og:image" content="([^"]+)"/i,
      /<meta name="twitter:image" content="([^"]+)"/i,
      /"image"\s*:\s*"([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i,
    ];
    for (const p of imgPatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http')) { imagem = m[1]; break; }
    }

    // ── DISPONIBILIDADE ──
    const disponivel = !html.match(/out[\s-]of[\s-]stock|esgotado|indisponível|sold[\s-]out/i);

    return { nome, preco, moeda, imagem, disponivel, url };
  } catch(e) {
    return { nome: null, preco: null, moeda: 'EUR', imagem: null, disponivel: true, url, erro: e.message };
  }
}

// ════════════════════════════════════════════════
// ROTAS PÚBLICAS
// ════════════════════════════════════════════════

app.get('/', (req, res) => res.json({ status: 'ok', app: 'Emir Backend', version: '2.0.0' }));

// ── GET /api/produtos ─────────────────────────
app.get('/api/produtos', async (req, res) => {
  const { categoria } = req.query;
  let query = supabase.from('produtos').select('*').eq('ativo', true).order('id');
  if (categoria && categoria !== 'Todos') query = query.eq('categoria', categoria);
  const { data, error } = await query;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// ── GET /api/cambio ───────────────────────────
app.get('/api/cambio', async (req, res) => {
  const rate = await getRate();
  res.json({ eur_aoa: rate, fonte: 'exchangerate-api.com' });
});

// ── POST /api/cotacao — NOVO ──────────────────
// Calcula cotação detalhada para um produto
app.post('/api/cotacao', async (req, res) => {
  const { preco_eur, produto_url, produto_nome } = req.body;
  if (!preco_eur || preco_eur <= 0)
    return res.status(400).json({ erro: 'Preço em EUR obrigatório.' });

  const rate     = await getRate();
  const cotacao  = calcularCotacao(Number(preco_eur), rate);

  res.json({
    preco_eur:    Number(preco_eur),
    taxa_cambio:  rate,
    ...cotacao,
    produto_url:  produto_url || null,
    produto_nome: produto_nome || null
  });
});


// ── POST /api/scrape — Extrai dados do produto ─
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ erro: 'URL obrigatório.' });

  const produto = await scrapeProduct(url);
  
  // Se temos preço, calcula cotação automática
  if (produto.preco) {
    const rate = await getRate();
    // Converter para EUR se necessário
    let preco_eur = produto.preco;
    if (produto.moeda === 'USD') preco_eur = produto.preco * 0.92;
    else if (produto.moeda === 'GBP') preco_eur = produto.preco * 1.17;
    
    produto.preco_eur = Math.round(preco_eur * 100) / 100;
    produto.cotacao = calcularCotacao(preco_eur, rate);
    produto.taxa_cambio = rate;
  }

  res.json(produto);
});

// ── POST /api/encomendas ──────────────────────
app.post('/api/encomendas', async (req, res) => {
  const {
    produto_url, produto_nome, quantidade = 1,
    preco_eur, metodo_pag,
    cliente_nome, cliente_tel, cliente_email,
    cliente_prov, cliente_mun, cliente_morada, notas
  } = req.body;

  if (!produto_url || !cliente_nome || !cliente_tel || !cliente_prov || !cliente_morada || !metodo_pag)
    return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });

  const rate    = await getRate();
  const cotacao = preco_eur ? calcularCotacao(Number(preco_eur), rate) : { total: 0 };
  const numero  = await gerarNumeroEncomenda();

  const encomenda = {
    numero, produto_url, produto_nome, quantidade,
    preco_eur: preco_eur || null,
    total_kz: cotacao.total,
    metodo_pag, estado: 'Pendente',
    cliente_nome, cliente_tel, cliente_email: cliente_email || null,
    cliente_prov, cliente_mun, cliente_morada, notas
  };

  const { data, error } = await supabase.from('encomendas').insert(encomenda).select().single();
  if (error) return res.status(500).json({ erro: error.message });

  // Notificações (não bloqueantes)
  notificarWhatsApp(data);
  emailNovaEncomendaAdmin(data);

  res.status(201).json({
    sucesso: true,
    numero:  data.numero,
    mensagem: 'Encomenda registada! Receberás confirmação em breve.'
  });
});

// ── POST /api/auth/login ──────────────────────
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ erro: 'Email e password obrigatórios.' });

  const { data: admin, error } = await supabase
    .from('admins').select('*').eq('email', email.toLowerCase()).single();

  if (error || !admin)
    return res.status(401).json({ erro: 'Credenciais inválidas.' });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas.' });

  const token = jwt.sign(
    { id: admin.id, email: admin.email, nome: admin.nome },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, nome: admin.nome, email: admin.email });
});

// ════════════════════════════════════════════════
// ROTAS PRIVADAS
// ════════════════════════════════════════════════

// ── GET /api/admin/encomendas ─────────────────
app.get('/api/admin/encomendas', authMiddleware, async (req, res) => {
  const { estado, page = 1, limit = 20 } = req.query;
  const from = (page - 1) * limit;
  let query = supabase.from('encomendas')
    .select('*', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .range(from, from + limit - 1);
  if (estado && estado !== 'Todos') query = query.eq('estado', estado);
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ encomendas: data, total: count, page: Number(page), limit: Number(limit) });
});

// ── GET /api/admin/encomendas/:id ─────────────
app.get('/api/admin/encomendas/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('encomendas').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ erro: 'Encomenda não encontrada.' });
  res.json(data);
});

// ── PATCH /api/admin/encomendas/:id/estado ────
// Muda estado + envia email automático ao cliente
app.patch('/api/admin/encomendas/:id/estado', authMiddleware, async (req, res) => {
  const { estado } = req.body;
  if (!ESTADOS.includes(estado))
    return res.status(400).json({ erro: 'Estado inválido.', estados_validos: ESTADOS });

  const { data, error } = await supabase
    .from('encomendas').update({ estado }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ erro: error.message });

  // Notifica cliente por email automaticamente
  enviarEmailEstado(data);

  res.json({ sucesso: true, encomenda: data });
});

// ── GET /api/admin/estados ────────────────────
// Lista todos os estados possíveis
app.get('/api/admin/estados', authMiddleware, (req, res) => {
  res.json(ESTADOS.map(e => ({ estado: e, emoji: ESTADO_EMOJI[e] })));
});

// ── GET /api/admin/dashboard ──────────────────
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  const contagens = await Promise.all(
    ESTADOS.map(e =>
      supabase.from('encomendas').select('*', { count: 'exact', head: true }).eq('estado', e)
        .then(r => ({ estado: e, count: r.count || 0 }))
    )
  );

  const { data: receita } = await supabase.from('encomendas').select('total_kz').eq('estado', 'Entregue');
  const totalKz = (receita || []).reduce((sum, e) => sum + (e.total_kz || 0), 0);

  const { count: totalEncomendas } = await supabase.from('encomendas').select('*', { count: 'exact', head: true });

  res.json({
    total_encomendas: totalEncomendas || 0,
    receita_kz: Math.round(totalKz),
    por_estado: contagens
  });
});


// ── PATCH /api/admin/encomendas/:id — actualizar tracking ────
app.patch('/api/admin/encomendas/:id', authMiddleware, async (req, res) => {
  const { tracking_code } = req.body;
  const { data, error } = await supabase
    .from('encomendas').update({ tracking_code }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ sucesso: true, encomenda: data });
});

// ── CRUD PRODUTOS ─────────────────────────────
app.get('/api/admin/produtos', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('produtos').select('*').order('id');
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

app.post('/api/admin/produtos', authMiddleware, async (req, res) => {
  const { nome, categoria, loja, preco_eur, imagem_url } = req.body;
  if (!nome || !categoria || !loja || !preco_eur)
    return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });
  const { data, error } = await supabase.from('produtos').insert({ nome, categoria, loja, preco_eur, imagem_url }).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json(data);
});

app.patch('/api/admin/produtos/:id', authMiddleware, async (req, res) => {
  const { nome, categoria, loja, preco_eur, imagem_url, ativo } = req.body;
  const { data, error } = await supabase.from('produtos').update({ nome, categoria, loja, preco_eur, imagem_url, ativo }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

app.delete('/api/admin/produtos/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ sucesso: true });
});

// ── MUDAR PASSWORD ────────────────────────────
app.post('/api/admin/password', authMiddleware, async (req, res) => {
  const { password_atual, password_nova } = req.body;
  if (!password_atual || !password_nova || password_nova.length < 8)
    return res.status(400).json({ erro: 'Password nova deve ter pelo menos 8 caracteres.' });
  const { data: admin } = await supabase.from('admins').select('password_hash').eq('id', req.admin.id).single();
  const ok = await bcrypt.compare(password_atual, admin.password_hash);
  if (!ok) return res.status(401).json({ erro: 'Password actual incorrecta.' });
  const hash = await bcrypt.hash(password_nova, 10);
  await supabase.from('admins').update({ password_hash: hash }).eq('id', req.admin.id);
  res.json({ sucesso: true });
});

// ── START ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Emir Backend v2 a correr na porta ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   Email:    ${process.env.RESEND_API_KEY ? '✅ Resend configurado' : '⚠️  Resend não configurado'}`);
  console.log(`   WhatsApp: ${process.env.ZAPI_INSTANCE_ID ? '✅ Z-API configurado' : '⚠️  Z-API não configurado'}\n`);
});
