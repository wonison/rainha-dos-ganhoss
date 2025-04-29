// Controle de exibição dos modais: apenas um por vez
// Exibe primeiro o de termos, depois o de promoção (se necessário)
document.addEventListener('DOMContentLoaded', function() {
  const termsModal = document.getElementById('termsModalCustom');
  const acceptBtn = document.getElementById('acceptTermsCustom');
  const promoModal = document.getElementById('promoModal');
  const closePromoBtn = document.getElementById('closePromo');
  const doNotShowAgain = document.getElementById('doNotShowAgain');

  // Função para mostrar um modal
  function showModal(modal) {
    if (modal) modal.style.display = 'flex';
  }
  // Função para esconder um modal
  function hideModal(modal) {
    if (modal) modal.style.display = 'none';
  }

  // Inicialmente, esconde ambos
  hideModal(termsModal);
  hideModal(promoModal);

  // Lógica de exibição
  if (!localStorage.getItem('termsAccepted')) {
    showModal(termsModal);
  } else if (!localStorage.getItem('promoShown')) {
    showModal(promoModal);
  }

  // Aceitar termos
  if (acceptBtn) {
    acceptBtn.addEventListener('click', function() {
      localStorage.setItem('termsAccepted', 'true');
      hideModal(termsModal);
      // Só mostra o promo se ainda não foi marcado para não mostrar
      if (!localStorage.getItem('promoShown')) {
        showModal(promoModal);
      }
    });
  }

  // Fechar promo
  if (closePromoBtn) {
    closePromoBtn.addEventListener('click', function() {
      if (doNotShowAgain && doNotShowAgain.checked) {
        localStorage.setItem('promoShown', 'true');
      }
      hideModal(promoModal);
    });
  }

  // Inicia o sistema de atualização e carrega os jogos
  iniciarSistemaAtualizacao();
  carregarJogosDoJSON();
});

// Array de jogos será carregado do JSON do admin
let jogos = [];

function carregarJogosDoJSON() {
  fetch('/api/jogos?nocache=' + Date.now())
    .then(r => r.json())
    .then(data => {
      jogos = data;
      // Limpa as apostas selecionadas anteriores
      jogos.forEach(jogo => {
        delete jogo._apostasSelecionadas;
      });
      atualizarPorcentagens();
    })
    .catch(error => {
      console.error('Erro ao carregar jogos:', error);
    });
}

// Função para determinar a cor da barra baseada no valor da aposta
function getBarraClasse(valor) {
  // Primeiro, garantir que o valor é um número
  if (typeof valor !== 'number') {
    valor = parseInt(valor);
  }
  
  // Se não for um número válido, retorna vermelho como padrão
  if (isNaN(valor)) return 'vermelho';

  // Lógica para Aposta Padrão e Máxima:
  // Vermelho: 0-40% (risco alto)
  // Amarelo: 41-75% (risco médio)
  // Verde: 76-100% (risco baixo)
  if (valor <= 40) return 'vermelho';
  if (valor <= 75) return 'amarelo';
  return 'verde';
}

// Função específica para aposta mínima (lógica inversa)
function getBarraClasseMinima(valor) {
  if (typeof valor !== 'number') {
    valor = parseInt(valor);
  }
  
  if (isNaN(valor)) return 'vermelho';

  // Para Aposta Mínima:
  // Verde: 0-30% (bom para começar)
  // Amarelo: 31-60% (moderado para começar)
  // Vermelho: 61-100% (alto para começar)
  if (valor <= 30) return 'verde';
  if (valor <= 60) return 'amarelo';
  return 'vermelho';
}

// Função para gerar e atribuir valores e cores de apostas a cada jogo
function prepararApostas(jogos) {
  if (!jogos || !Array.isArray(jogos)) return;

  jogos.forEach(jogo => {
    // Remove o % e converte para número
    const padrao = parseInt(String(jogo.apostapadrao || '0').replace('%', ''));
    const minima = parseInt(String(jogo.apostas_minimas || '0').replace('%', ''));
    let maxima = parseInt(String(jogo.apostasmaxima || '0').replace('%', ''));
    
    // Limita a aposta máxima a 92%
    maxima = Math.min(maxima, 92);

    // Define as cores baseadas nos valores
    const getCorBarra = (valor) => {
      if (isNaN(valor)) return 'vermelho';
      if (valor <= 30) return 'vermelho';    // Valores baixos
      if (valor <= 60) return 'amarelo';     // Valores intermediários
      return 'verde';                        // Valores altos (até 92%)
    };

    // Atualiza o objeto jogo com os valores processados
    jogo._apostas = [
      { 
        label: 'Aposta Padrão', 
        valor: padrao,
        cor: getCorBarra(padrao),
        displayWidth: Math.max(padrao, 1)
      },
      { 
        label: 'Aposta Mínima', 
        valor: minima,
        cor: getCorBarra(minima),
        displayWidth: Math.max(minima, 1)
      },
      { 
        label: 'Aposta Máxima', 
        valor: maxima,
        cor: getCorBarra(maxima),
        displayWidth: Math.max(maxima, 1)
      }
    ];

    // Mantém os valores originais
    jogo._padrao = padrao;
    jogo._minima = minima;
    jogo._maxima = maxima;
    jogo._distribuicao = parseInt(String(jogo.distribuicao || '28').replace('%', ''));
  });
}

function renderizarJogos(lista) {
  try {
    const container = document.getElementById('jogos');
    if (!container) return;

    prepararApostas(lista);
    container.innerHTML = '';

    lista.forEach(jogo => {
      // Sorteia 2 apostas sugeridas aleatórias
      let apostasSorteadas = [];
      if (Array.isArray(jogo.apostasugerida) && jogo.apostasugerida.length > 0) {
        const embaralhadas = [...jogo.apostasugerida].sort(() => Math.random() - 0.5);
        apostasSorteadas = embaralhadas.slice(0, 2);
      } else {
        apostasSorteadas = ['Nenhuma aposta sugerida'];
      }

      const card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('data-categoria', jogo.categoria);
      
      const getAposta = label => jogo._apostas.find(a => a.label === label);
      
      card.innerHTML = `
        <img src="${jogo.imagem}" alt="${jogo.nome}">
        <h2>${jogo.nome}</h2>
        <p>Distribuição: <span class="destaque">${jogo._distribuicao}%</span></p>
        
        <p>Aposta Padrão: <span class="destaque">${getAposta('Aposta Padrão').valor}%</span></p>
        <div class="barra-container">
          <div class="barra ${getAposta('Aposta Padrão').cor}" 
               style="width: ${getAposta('Aposta Padrão').displayWidth}%"></div>
        </div>
        
        <p>Aposta Mínima: <span class="destaque">${getAposta('Aposta Mínima').valor}%</span></p>
        <div class="barra-container">
          <div class="barra ${getAposta('Aposta Mínima').cor}" 
               style="width: ${getAposta('Aposta Mínima').displayWidth}%"></div>
        </div>
        
        <p>Aposta Máxima: <span class="destaque">${getAposta('Aposta Máxima').valor}%</span></p>
        <div class="barra-container">
          <div class="barra ${getAposta('Aposta Máxima').cor}" 
               style="width: ${getAposta('Aposta Máxima').displayWidth}%"></div>
        </div>
        
        <div class="aposta-sugerida-box">
          <span class="mb-2">Aposta Sugerida:</span>
          ${apostasSorteadas.map(aposta => `<span>${aposta}</span>`).join('')}
        </div>
        <a href="${jogo.link}" target="_blank" class="jogar-btn">Jogar</a>
      `;
      
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Erro ao renderizar jogos:', error);
  }
}

// Função auxiliar para processar o texto da aposta sugerida
function processarApostaSugerida(texto) {
  // Remove espaços extras e quebras de linha
  texto = texto.trim();
  
  // Padrão para extrair número e valor
  const padraoBet = /(\d+)°?\s*BET\s*(BÔNUS|CONEXÃO)\s*\(?(\d+\.?\d*)\)?/i;
  const match = texto.match(padraoBet);
  
  if (match) {
    // Retorna [número, valor formatado]
    return [match[1], parseFloat(match[3]).toFixed(2)];
  }
  
  // Valores padrão se não conseguir extrair
  return [1, '1.20'];
}

function filtrar(categoria) {
  try {
    // Remove a classe 'ativo' de todos os filtros
    document.querySelectorAll('.filtro').forEach(btn => btn.classList.remove('ativo'));
    // Adiciona a classe 'ativo' ao filtro clicado
    const activeFilter = document.querySelector(`.filtro[onclick*="${categoria}"]`);
    if (activeFilter) {
      activeFilter.classList.add('ativo');
    }

    let lista = jogos;
    if (categoria !== 'todos') {
      lista = jogos.filter(jogo => jogo.categoria === categoria);
    }
    renderizarJogos(lista);
  } catch (error) {
    console.error('Error filtering games:', error);
  }
}

// Busca dinâmica pelo nome do jogo
const buscaInput = document.getElementById('busca');
if (buscaInput) {
  buscaInput.addEventListener('input', function() {
    try {
      const termo = this.value.toLowerCase();
      const cardsFiltrados = jogos.filter(jogo => jogo.nome.toLowerCase().includes(termo));
      renderizarJogos(cardsFiltrados);
    } catch (error) {
      console.error('Error searching games:', error);
    }
  });
}

function atualizarPorcentagens() {
  try {
    // Função auxiliar para gerar número aleatório em um intervalo
    const gerarNumeroAleatorio = (min, max) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    // Função para gerar porcentagem em um intervalo específico
    const gerarPorcentagemUnica = (min, max, porcentagensUsadas) => {
      let novaPorcentagem;
      do {
        novaPorcentagem = gerarNumeroAleatorio(min, max);
      } while (porcentagensUsadas.includes(novaPorcentagem));
      porcentagensUsadas.push(novaPorcentagem);
      return novaPorcentagem;
    };

    // Arrays para controlar porcentagens já utilizadas
    const porcentagensUsadas = [];
    const porcentagensDistribuicao = [];

    jogos.forEach(jogo => {
      // Distribuição: 28% a 89%
      jogo.distribuicao = gerarPorcentagemUnica(28, 89, porcentagensDistribuicao) + '%';

      // Gera três porcentagens diferentes entre 1% e 92%
      const porcentagens = [];
      for(let i = 0; i < 3; i++) {
        porcentagens.push(gerarPorcentagemUnica(1, 92, porcentagensUsadas));
      }

      // Atribui as porcentagens
      jogo.apostas_minimas = porcentagens[0] + '%';
      jogo.apostapadrao = porcentagens[1] + '%';
      jogo.apostasmaxima = Math.min(porcentagens[2], 92) + '%';

      // Processa as apostas sugeridas apenas se ainda não foram processadas
      if (!jogo._apostasSelecionadas) {
        const todasApostas = typeof jogo.apostasugerida === 'string' 
          ? jogo.apostasugerida.split('\n').filter(a => a.trim())
          : Array.isArray(jogo.apostasugerida) 
            ? jogo.apostasugerida 
            : [jogo.apostasugerida];

        if (todasApostas.length > 0) {
          // Embaralha e seleciona 2 apostas diferentes
          const apostasEmbaralhadas = [...todasApostas].sort(() => Math.random() - 0.5);
          jogo._apostasSelecionadas = apostasEmbaralhadas.slice(0, 2);
        } else {
          // Valores padrão se não houver apostas cadastradas
          jogo._apostasSelecionadas = [
            '1° BET BÔNUS (0.40)',
            '2° BET CONEXÃO (1.20)'
          ];
        }
      }
    });

    // Após atualizar as porcentagens, atualiza a visualização
    prepararApostas(jogos);
    renderizarJogos(jogos);

  } catch (error) {
    console.error('Erro ao atualizar porcentagens:', error);
  }
}

// Função para formatar número com zero à esquerda
function padZero(num) {
    return num < 10 ? `0${num}` : num;
}

// Função para formatar tempo restante
function formatarTempoRestante(segundos) {
    const minutos = Math.floor(segundos / 60);
    const segsRestantes = segundos % 60;
    return `${padZero(minutos)}:${padZero(segsRestantes)}`;
}

// Função para atualizar o status box
function atualizarStatusBox() {
    const agora = new Date();
    const ultimaAtualizacao = new Date(window.ultimaAtualizacao || agora);
    const proximaAtualizacao = new Date(ultimaAtualizacao.getTime() + (10 * 60 * 1000)); // 10 minutos após a última

    // Calcula tempo restante em segundos
    const tempoRestante = Math.max(0, Math.floor((proximaAtualizacao - agora) / 1000));

    // Formata as horas
    const horaUltima = padZero(ultimaAtualizacao.getHours());
    const minutoUltimo = padZero(ultimaAtualizacao.getMinutes());
    const horaProxima = padZero(proximaAtualizacao.getHours());
    const minutoProximo = padZero(proximaAtualizacao.getMinutes());

    // Cria ou atualiza a status box
    let statusBox = document.querySelector('.status-box');
    if (!statusBox) {
        statusBox = document.createElement('div');
        statusBox.className = 'status-box';
        document.body.insertBefore(statusBox, document.body.firstChild);
    }

    statusBox.innerHTML = `
        <div>Última atualização: ${horaUltima}:${minutoUltimo}</div>
        <div>Próxima atualização: ${horaProxima}:${minutoProximo} (${formatarTempoRestante(tempoRestante)})</div>
    `;

    // Se o tempo acabou, atualiza as porcentagens
    if (tempoRestante <= 0) {
        atualizarPorcentagens();
        window.ultimaAtualizacao = new Date();
    }
}

// Função que inicia o sistema de atualização
function iniciarSistemaAtualizacao() {
    // Define a primeira atualização
    window.ultimaAtualizacao = new Date();
    
    // Atualiza o status imediatamente
    atualizarStatusBox();
    
    // Atualiza o contador a cada segundo
    setInterval(atualizarStatusBox, 1000);
}
