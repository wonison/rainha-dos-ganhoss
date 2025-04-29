// Backend Node.js/Express para painel admin local
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = 3000;

const SESSION_COOKIE = 'admin_session';
const SESSION_SECRET = 'rainha-dos-ganhos';

// Supabase credentials
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
console.log('Supabase URL:', SUPABASE_URL ? 'Configurado' : 'Não configurado');
console.log('Supabase Key:', SUPABASE_KEY ? 'Configurado' : 'Não configurado');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(bodyParser.json());
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(__dirname));

// Função para verificar se está autenticado
function isAuthenticated(req) {
  return req.cookies && req.cookies[SESSION_COOKIE] === 'logado';
}

// Middleware para proteger rotas do admin
function requireAuth(req, res, next) {
  if (isAuthenticated(req)) {
    next();
  } else {
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      res.status(401).json({ error: 'Não autorizado' });
    } else {
      res.redirect('/acesso.html');
    }
  }
}

// Rota de login
app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .or(`username.eq.${usuario},email.eq.${usuario}`)
    .single();

  if (error || !data) {
    console.error('Erro no login:', error?.message || 'Usuário não encontrado');
    return res.sendStatus(401);
  }

  const senhaCorreta = await bcrypt.compare(senha, data.password_hash);
  if (senhaCorreta) {
    // Salva o id do admin em um cookie (não seguro para produção, mas suficiente para este contexto)
    res.cookie(SESSION_COOKIE, 'logado', { httpOnly: true });
    res.cookie('admin_id', data.id, { httpOnly: false }); // visível no frontend
    res.sendStatus(200);
  } else {
    console.error('Senha incorreta');
    res.sendStatus(401);
  }
});

// Rota protegida admin
app.get('/admin.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Função para mapear campos das plataformas
function mapPlataformaCampos(p) {
  return {
    nome: p.nome || '',
    imagem: p.imagem || '',
    status: p.status || '',
    link: p.link || '',
    id_administrador: p.id_administrador // será preenchido no POST
  };
}

// Função para mapear campos dos jogos
function mapJogoCampos(jogo) {
  return {
    nome: jogo.nome || jogo.Nome || '',
    imagem: jogo.imagem || jogo.Imagem || '',
    categoria: jogo.categoria || jogo.Categoria || '',
    distribuicao: jogo.distribuicao || jogo.Distribuicao || '',
    apostapadrao: jogo.apostapadrao || jogo.apostaPadrao || '10%',
    apostas_minimas: jogo.apostas_minimas || jogo.apostaMinima || '1%',
    apostasmaxima: jogo.apostasmaxima || jogo.apostaMaxima || '100%',
    apostasugerida: Array.isArray(jogo.apostasugerida)
      ? jogo.apostasugerida
      : (typeof jogo.apostasugerida === 'string'
          ? jogo.apostasugerida.split('\n').map(a => a.trim()).filter(a => a)
          : []),
    link: jogo.link || jogo.Link || '',
    id_administrador: jogo.id_administrador
  };
}

// Rotas GET públicas
app.get('/api/plataformas', async (req, res) => {
  try {
    // Remover filtro por adminId para mostrar todas as plataformas
    const { data, error } = await supabase
      .from('plataformas')
      .select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Erro ao buscar plataformas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jogos', async (req, res) => {
  try {
    // Remover filtro por adminId para mostrar todos os jogos
    const { data, error } = await supabase
      .from('jogos')
      .select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Erro ao buscar jogos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Rotas POST protegidas
app.post('/api/plataformas', requireAuth, async (req, res) => {
  try {
    const adminId = req.cookies.admin_id;
    if (!adminId) return res.status(401).json({ error: 'Não autorizado' });

    // Remove apenas as plataformas do admin logado
    const { error: delError } = await supabase.from('plataformas').delete().eq('id_administrador', adminId);
    if (delError) throw delError;

    const mappedPlataformas = req.body.map(p => ({ ...mapPlataformaCampos(p), id_administrador: adminId }));
    const { error: insError } = await supabase.from('plataformas').insert(mappedPlataformas);
    if (insError) throw insError;

    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao salvar plataformas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jogos', requireAuth, async (req, res) => {
  try {
    const adminId = req.cookies.admin_id;
    if (!adminId) return res.status(401).json({ error: 'Não autorizado' });

    // Remove apenas os jogos do admin logado
    const { error: delError } = await supabase.from('jogos').delete().eq('id_administrador', adminId);
    if (delError) {
      console.error('Erro ao limpar jogos:', delError);
      return res.status(500).json({ error: delError.message || delError.details || delError });
    }
    // Mapeia os campos antes de inserir e adiciona o id_administrador
    const mappedJogos = req.body.map(j => ({ ...mapJogoCampos(j), id_administrador: adminId }));
    // Validação dos campos obrigatórios
    const jogosValidos = mappedJogos.filter(j =>
      j.nome && j.imagem && j.categoria && j.distribuicao &&
      j.apostapadrao && j.apostas_minimas && j.apostasmaxima && j.link
    );
    if (jogosValidos.length !== mappedJogos.length) {
      console.error('Jogos inválidos:', mappedJogos.filter(j => !j.apostapadrao));
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }
    console.log('Jogos enviados para o banco:', jogosValidos);
    const { error: insError } = await supabase.from('jogos').insert(jogosValidos);
    if (insError) {
      console.error('Erro ao salvar jogos:', insError);
      return res.status(500).json({ error: insError.message || insError.details || insError });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Erro inesperado:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Endpoint para criar usuário admin
app.post('/criar-usuario', async (req, res) => {
  const { usuario, email, senha } = req.body;
  if (!usuario || !email || !senha) {
    return res.status(400).send('Usuário, email e senha são obrigatórios.');
  }
  try {
    const { data: existente, error: errorBusca } = await supabase
      .from('admins')
      .select('id')
      .or(`username.eq.${usuario},email.eq.${email}`)
      .single();
    if (existente) {
      return res.status(409).send('Usuário ou email já existe.');
    }

    const hash = await bcrypt.hash(senha, 10);
    const { error } = await supabase
      .from('admins')
      .insert([{ username: usuario, email: email, password_hash: hash }]);
    if (error) throw error;

    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao criar usuário:', err.message);
    res.status(500).send('Erro interno ao criar usuário.');
  }
});

// Rota de logout para garantir remoção do cookie
app.get('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/acesso.html');
});

// Rota padrão
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Middleware global de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro global:', err);
  res.status(500).json({ error: err.message || err });
});

// Inicializa servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
