// ══════════════════════════════════════════════════
// EMIR.COM — Backend v4
// Puppeteer (Chrome headless) para scraping real
// ══════════════════════════════════════════════════
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const axios     = require('axios');
const rateLimit = require('express-rate-limit');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway corre atrás de um proxy — necessário para rate limiting
app.set('trust proxy', 1);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── MIDDLEWARE ─────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { erro: 'Muitas tentativas. Aguarda 15 minutos.' }
});

// ── PUPPETEER — instância partilhada ──────────────
let browser = null;
async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
        '--lang=pt-PT,pt,en'
      ]
    });
    console.log('[Browser] Chrome headless iniciado');
  }
  return browser;
}

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

async function notificarEmail(enc) {
  // Integração Resend — adiciona RESEND_API_KEY nas variáveis do Railway
  const key = process.env.RESEND_API_KEY;
  const to  = process.env.ADMIN_EMAIL;
  if (!key || !to) return;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <div style="background:#0A1628;padding:24px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:1.4rem">📦 Nova Encomenda — Emir.com</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#666;width:140px">Número</td><td style="padding:8px 0;font-weight:700">${enc.numero}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Produto</td><td style="padding:8px 0">${enc.produto_nome || enc.produto_url}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Quantidade</td><td style="padding:8px 0">${enc.quantidade}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Total</td><td style="padding:8px 0;font-weight:700;color:#1A6BFF">${Math.round(enc.total_kz).toLocaleString('pt-AO')} Kz</td></tr>
          <tr><td style="padding:8px 0;color:#666">Pagamento</td><td style="padding:8px 0">${enc.metodo_pag}</td></tr>
          <tr><td colspan="2" style="padding:16px 0 4px;font-weight:700;color:#333">Entrega</td></tr>
          <tr><td style="padding:8px 0;color:#666">Nome</td><td style="padding:8px 0">${enc.entrega_nome}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Telefone</td><td style="padding:8px 0">${enc.entrega_tel}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Localização</td><td style="padding:8px 0">${enc.entrega_prov}${enc.entrega_mun ? ', ' + enc.entrega_mun : ''}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Morada</td><td style="padding:8px 0">${enc.entrega_morada}</td></tr>
          ${enc.notas ? `<tr><td style="padding:8px 0;color:#666">Notas</td><td style="padding:8px 0">${enc.notas}</td></tr>` : ''}
        </table>
        <div style="margin-top:20px">
          <a href="${enc.produto_url}" style="background:#1A6BFF;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver Produto →</a>
        </div>
      </div>
    </div>`;

  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Emir.com <noreply@emir.com>',
      to,
      subject: `📦 Nova Encomenda ${enc.numero} — ${Math.round(enc.total_kz).toLocaleString('pt-AO')} Kz`,
      html
    }, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 8000
    });
    console.log('[Email] Notificação enviada para', to);
  } catch (e) { console.error('[Email]', e.message); }
}

// ── PUPPETEER SCRAPER ──────────────────────────────
async function scrapeProduct(url) {
  const result = { titulo: null, preco: null, imagem: null, moeda: 'EUR' };
  let page = null;

  console.log('[SCRAPE] A iniciar para:', url);
  try {
    const br  = await getBrowser();
    console.log('[SCRAPE] Browser obtido, a abrir página...');
    page = await br.newPage();

    // Oculta que é um bot
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-PT,pt;q=0.9,en-GB;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-PT', 'pt', 'en-GB', 'en'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      window.chrome = { runtime: {} };
    });
    
    // Viewport realista
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

    // Bloqueia recursos desnecessários (imagens, fontes, media) para ser mais rápido
    await page.setRequestInterception(true);
    page.on('request', req => {
      const rt = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(rt)) req.abort();
      else req.continue();
    });

    console.log('[SCRAPE] A navegar para a URL...');
    // Usa load em vez de networkidle2 — mais tolerante com lojas lentas
    await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(async (e) => {
      // Se timeout, tenta continuar com o que carregou
      console.log('[SCRAPE] Timeout parcial, a tentar continuar...');
    });
    console.log('[SCRAPE] Página carregada, a aguardar JS...');

    // Simula scroll para activar lazy loading
    await page.evaluate(() => window.scrollTo(0, 300)).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    
    // Log do título real para debug
    const pageTitle = await page.title().catch(() => '');
    console.log('[SCRAPE] Título da página:', pageTitle);

    console.log('[SCRAPE] A extrair dados...');
    // Extrai dados directamente no browser
    const dados = await page.evaluate(() => {
      const get = sel => document.querySelector(sel)?.textContent?.trim() || '';
      const attr = (sel, a) => document.querySelector(sel)?.getAttribute(a) || '';

      // Título
      const titulo = attr('meta[property="og:title"]', 'content') ||
        attr('meta[name="twitter:title"]', 'content') ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.title || '';

      // Imagem
      const imagem = attr('meta[property="og:image"]', 'content') ||
        attr('meta[name="twitter:image"]', 'content') || '';

      // Preço via JSON-LD
      let preco = null, moeda = 'EUR';
      document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
        if (preco) return;
        try {
          const json = JSON.parse(el.textContent);
          const objs = Array.isArray(json) ? json : [json];
          for (const obj of objs) {
            const oferta = obj?.offers || obj?.Offers;
            const price  = obj?.price || oferta?.price || oferta?.lowPrice;
            const curr   = obj?.priceCurrency || oferta?.priceCurrency;
            if (price && parseFloat(price) > 0) {
              preco = parseFloat(String(price).replace(',', '.'));
              if (curr) moeda = curr.toUpperCase();
              break;
            }
          }
        } catch {}
      });

      // Preço via meta tags
      if (!preco) {
        const mp = attr('meta[property="og:price:amount"]', 'content') ||
          attr('meta[name="price"]', 'content') ||
          attr('meta[itemprop="price"]', 'content');
        if (mp) {
          preco = parseFloat(mp.replace(',', '.'));
          const mc = attr('meta[property="og:price:currency"]', 'content');
          if (mc) moeda = mc.toUpperCase();
        }
      }

      // Preço via seletores CSS — cobre Amazon, Zara, Nike, ASOS, Farfetch, Shein, H&M
      if (!preco) {
        const sels = [
          // Amazon
          '.a-price-whole', '#priceblock_ourprice', '#priceblock_dealprice',
          'span[data-a-color="price"] .a-offscreen',
          // Zara
          '[data-qa-action="size-in-stock"] .price-current__amount',
          '.price-current__amount',
          // Nike
          '[data-test="product-price"]', '.product-price',
          // ASOS
          '[data-auto-id="productPrice"]', '.current-price',
          // Farfetch
          '[data-testid="price-label"]',
          // Shein
          '.product-intro__head-mainprice',
          // H&M
          '.product-item-price',
          // Genérico
          '[class*="price"]:not([class*="original"]):not([class*="was"]):not([class*="old"])',
          '[class*="Price"]:not([class*="Original"]):not([class*="Was"])',
          '[itemprop="price"]', '.price', '#price'
        ];
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const txt = (el.getAttribute('content') || el.textContent || '').trim();
          const m = txt.match(/([\d]{1,6}[.,][\d]{2})/);
          if (m) {
            const v = parseFloat(m[1].replace(',', '.'));
            if (v > 0 && v < 100000) { preco = v; break; }
          }
        }
      }

      return { titulo: titulo.replace(/\s+/g, ' ').slice(0, 120), imagem, preco, moeda };
    });

    result.titulo = dados.titulo || null;
    result.imagem = dados.imagem || null;
    result.preco  = dados.preco  || null;
    result.moeda  = dados.moeda  || 'EUR';
    console.log('[SCRAPE] Resultado:', JSON.stringify(result));

    // Converte para EUR se necessário
    if (result.preco && result.moeda !== 'EUR') {
      try {
        const { data } = await axios.get(
          `https://api.exchangerate-api.com/v4/latest/${result.moeda}`, { timeout: 3000 }
        );
        const toEur = data.rates?.EUR;
        if (toEur) { result.preco = +(result.preco * toEur).toFixed(2); result.moeda = 'EUR'; }
      } catch {}
    }

  } catch (e) {
    console.error('[SCRAPE Puppeteer] ERRO:', e.message);
    console.error('[SCRAPE Puppeteer] STACK:', e.stack?.split('\n')[0]);
  } finally {
    if (page) await page.close().catch(() => {});
  }

  return result;
}

// ════════════════════════════════════════════════
// ROTAS PÚBLICAS
// ════════════════════════════════════════════════

app.get('/', (_, res) => res.json({ status: 'ok', app: 'Emir Backend v4 — Puppeteer' }));

app.get('/api/cambio', async (_, res) => {
  const rate = await getRate();
  res.json({ eur_aoa: rate });
});

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ erro: 'URL em falta.' });
  const data = await scrapeProduct(url);
  res.json(data);
});

app.get('/api/produtos', async (req, res) => {
  const { categoria } = req.query;
  let q = supabase.from('produtos').select('*').eq('ativo', true).order('id');
  if (categoria && categoria !== 'Todos') q = q.eq('categoria', categoria);
  const { data, error } = await q;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// ── TRACKING PÚBLICO ───────────────────────────────
app.get('/api/tracking/:numero', async (req, res) => {
  const { data, error } = await supabase.from('encomendas')
    .select('numero, produto_nome, produto_img, quantidade, total_kz, estado, tracking_code, entrega_prov, criado_em, atualizado_em, estados_historico(estado, nota, criado_em)')
    .eq('numero', req.params.numero.toUpperCase()).single();
  if (error || !data) return res.status(404).json({ erro: 'Encomenda não encontrada.' });
  if (data.estados_historico)
    data.estados_historico.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
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
    .eq('cliente_id', req.cliente.id).order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data || []);
});

app.get('/api/clientes/encomendas/:numero', authCliente, async (req, res) => {
  const { data, error } = await supabase.from('encomendas')
    .select('*, estados_historico(estado, nota, criado_em)')
    .eq('numero', req.params.numero).eq('cliente_id', req.cliente.id).single();
  if (error) return res.status(404).json({ erro: 'Não encontrada.' });
  if (data.estados_historico)
    data.estados_historico.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  res.json(data);
});

// ════════════════════════════════════════════════
// FAVORITOS
// ════════════════════════════════════════════════

app.get('/api/clientes/favoritos', authCliente, async (req, res) => {
  const { data, error } = await supabase.from('favoritos')
    .select('*, produtos(nome, imagem_url, preco_eur, loja)')
    .eq('cliente_id', req.cliente.id).order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data || []);
});

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

app.delete('/api/clientes/favoritos/:id', authCliente, async (req, res) => {
  const { error } = await supabase.from('favoritos')
    .delete().eq('id', req.params.id).eq('cliente_id', req.cliente.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ sucesso: true });
});

app.get('/api/clientes/favoritos/check/:produto_id', authCliente, async (req, res) => {
  const { data } = await supabase.from('favoritos')
    .select('id').eq('cliente_id', req.cliente.id)
    .eq('produto_id', req.params.produto_id).single();
  res.json({ favorito: !!data, id: data?.id || null });
});

// ════════════════════════════════════════════════
// ENCOMENDAS — só com conta de cliente
// ════════════════════════════════════════════════

app.post('/api/encomendas', authCliente, async (req, res) => {
  const {
    produto_url, produto_nome, produto_img, quantidade = 1,
    preco_eur, metodo_pag,
    entrega_nome, entrega_tel, entrega_prov, entrega_mun, entrega_morada, notas
  } = req.body;

  if (!produto_url || !entrega_nome || !entrega_tel || !entrega_prov || !entrega_morada || !metodo_pag)
    return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });

  const rate   = await getRate();
  const base   = (preco_eur || 0) * rate;
  const taxa   = base * 0.08;
  const total  = base + taxa + 5000;
  const numero = await gerarNumero();

  const enc = {
    numero, cliente_id: req.cliente.id,
    produto_url, produto_nome, produto_img,
    quantidade, preco_eur: preco_eur || null,
    cambio_usado: rate, base_kz: base, taxa_kz: taxa, envio_kz: 5000, total_kz: total,
    metodo_pag, estado: 'Pendente',
    entrega_nome, entrega_tel, entrega_prov, entrega_mun, entrega_morada, notas
  };

  const { data, error } = await supabase.from('encomendas').insert(enc).select().single();
  if (error) return res.status(500).json({ erro: error.message });

  await notificarEmail(data);

  res.status(201).json({
    sucesso: true, numero: data.numero,
    mensagem: `Encomenda ${data.numero} registada! Receberás confirmação por email em breve.`
  });
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
// ADMIN — RELATÓRIOS
// ════════════════════════════════════════════════

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
    dataInicio = new Date(now.getFullYear(), now.getMonth(), 1); dataFim = new Date();
  }

  const { data: encs } = await supabase.from('encomendas')
    .select('id, numero, total_kz, base_kz, taxa_kz, envio_kz, estado, metodo_pag, criado_em, entrega_prov, entrega_nome')
    .gte('criado_em', dataInicio.toISOString()).lte('criado_em', dataFim.toISOString())
    .order('criado_em', { ascending: false });

  const lista = encs || [];
  const entregues  = lista.filter(e => e.estado === 'Entregue');
  const canceladas = lista.filter(e => e.estado === 'Cancelado');
  const receita    = entregues.reduce((s, e) => s + (e.total_kz || 0), 0);
  const taxas      = entregues.reduce((s, e) => s + (e.taxa_kz  || 0), 0);

  const por_metodo = {};
  lista.forEach(e => {
    const m = e.metodo_pag || 'Outro';
    if (!por_metodo[m]) por_metodo[m] = { count: 0, total: 0 };
    por_metodo[m].count++; por_metodo[m].total += e.total_kz || 0;
  });

  const por_provincia = {};
  lista.forEach(e => {
    const p = e.entrega_prov || 'Desconhecida';
    if (!por_provincia[p]) por_provincia[p] = { count: 0, total: 0 };
    por_provincia[p].count++; por_provincia[p].total += e.total_kz || 0;
  });

  const por_dia = {};
  lista.forEach(e => {
    const dia = e.criado_em.slice(0, 10);
    if (!por_dia[dia]) por_dia[dia] = { encomendas: 0, receita: 0 };
    por_dia[dia].encomendas++;
    if (e.estado === 'Entregue') por_dia[dia].receita += e.total_kz || 0;
  });

  res.json({
    periodo: { inicio: dataInicio.toISOString(), fim: dataFim.toISOString() },
    resumo: {
      total_encomendas: lista.length, entregues: entregues.length,
      em_curso: lista.filter(e => !['Entregue','Cancelado','Pendente'].includes(e.estado)).length,
      pendentes: lista.filter(e => e.estado === 'Pendente').length,
      canceladas: canceladas.length,
      taxa_conversao: lista.length ? Math.round((entregues.length / lista.length) * 100) : 0
    },
    financeiro: {
      receita_total_kz: Math.round(receita), taxas_emir_kz: Math.round(taxas),
      valor_envio_kz:   Math.round(entregues.reduce((s, e) => s + (e.envio_kz || 0), 0)),
      ticket_medio_kz:  entregues.length ? Math.round(receita / entregues.length) : 0
    },
    por_metodo,
    por_provincia: Object.entries(por_provincia)
      .sort(([,a],[,b]) => b.count - a.count).slice(0, 10)
      .map(([provincia, v]) => ({ provincia, ...v })),
    evolucao: Object.entries(por_dia).sort(([a],[b]) => a.localeCompare(b)).map(([dia, v]) => ({ dia, ...v })),
    encomendas: lista.slice(0, 50)
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

// ── GRACEFUL SHUTDOWN ──────────────────────────────
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});

// ── START ──────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Emir Backend v4 — porta ${PORT}`);
  console.log(`   Puppeteer: Chrome headless`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL}\n`);
  // Inicia o browser logo no arranque para a primeira chamada ser mais rápida
  await getBrowser().catch(e => console.error('[Browser] Erro no arranque:', e.message));
});
