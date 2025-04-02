const firebaseConfig = {
    apiKey: "AIzaSyDzgJUGTVyGGQdMCTX2IZ8thZWNgVPUjXk",
    authDomain: "ies-fdb.firebaseapp.com",
    projectId: "ies-fdb",
    storageBucket: "ies-fdb.firebasestorage.app",
    messagingSenderId: "259063920503",
    appId: "1:259063920503:web:f7875e41e5f3781f3c5372"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let ultimoDoc = null;
let primeiroDoc = null;
let paginaAtual = 1;
const docsPorPagina = 3;
let filtroAtivo = null;

const elementos = {
    dados: document.getElementById("dados"),
    btnAnterior: document.getElementById("btnAnterior"),
    btnProximo: document.getElementById("btnProximo"),
    pagina: document.getElementById("paginaAtual"),
    templateInstituicao: document.getElementById("template-instituicao"),
    templateCurso: document.getElementById("template-curso"),
    statusCarregamento: document.getElementById("status-carregamento"),
    inputBusca: document.getElementById("busca"),
    selectTipoBusca: document.getElementById("tipoBusca"),
    btnBuscar: document.getElementById("btnBuscar"),
    btnLimparFiltros: document.getElementById("btnLimparFiltros"),
    templateSemResultados: document.getElementById("template-sem-resultados")
};

// Função para mostrar/ocultar o indicador de carregamento
function mostrarCarregamento(exibir = true) {
    elementos.statusCarregamento.style.display = exibir ? "block" : "none";
}

// Função para renderizar uma instituição (mantida da versão original)
function renderizarInstituicao(doc) {
    const data = doc.data();
    const clone = elementos.templateInstituicao.content.cloneNode(true);
    
    clone.querySelector(".instituicao-nome").textContent = `${data.nome || "Sem nome"} (${data.sigla || "N/I"})`;
    clone.querySelector(".instituicao-id").textContent = doc.id;
    clone.querySelector(".instituicao-tipo").textContent = data.instituicao || "Não informado";
    clone.querySelector(".instituicao-local").textContent = data.local || "Não informado";

    const corpoTabela = clone.querySelector(".corpo-tabela");
    
    // Verificar se existem cursos
    if (data.cursos && Object.keys(data.cursos).length > 0) {
        Object.entries(data.cursos).forEach(([nome, detalhes]) => {
            const cursoClone = elementos.templateCurso.content.cloneNode(true);
            const info = detalhes[0] || {};
            
            cursoClone.querySelector(".curso-nome").textContent = nome;
            cursoClone.querySelector(".curso-grau").textContent = info.grau || "N/I";
            cursoClone.querySelector(".curso-modalidade").textContent = info.modalidade || "N/I";
            cursoClone.querySelector(".curso-carga").textContent = info.carga || "N/I";

            corpoTabela.appendChild(cursoClone);
        });
    } else {
        // Caso não tenha cursos
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.setAttribute('colspan', '4');
        td.textContent = 'Nenhum curso cadastrado';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        corpoTabela.appendChild(tr);
    }

    elementos.dados.appendChild(clone);
}

// Função para buscar documento específico (por ID ou nome exato)
async function buscarDocumentoEspecifico() {
    mostrarCarregamento(true);
    
    try {
        let doc;
        
        if (filtroAtivo.tipo === 'id') {
            // Busca por ID (mais eficiente, apenas 1 leitura)
            doc = await db.collection("instituicoes").doc(filtroAtivo.valor).get();
        } else if (filtroAtivo.tipo === 'nome') {
            // Busca por nome exato (uma consulta, uma leitura)
            const snapshot = await db.collection("instituicoes")
                                     .where("nome", "==", filtroAtivo.valor)
                                     .limit(1)
                                     .get();
            
            if (!snapshot.empty) {
                doc = snapshot.docs[0];
            }
        } else if (filtroAtivo.tipo === 'sigla') {
            const snapshot = await db.collection("instituicoes")
                                     .where("sigla", "==", filtroAtivo.valor.toUpperCase())
                                     .limit(1)
                                      .get();
    
            if (!snapshot.empty) {
                doc = snapshot.docs[0];
            }
        }        
        elementos.dados.innerHTML = '';
        
        if (doc && doc.exists) {
            renderizarInstituicao(doc);
            elementos.pagina.textContent = "Resultado da busca";
        } else {
            // Exibir template de sem resultados
            const semResultados = elementos.templateSemResultados.content.cloneNode(true);
            elementos.dados.appendChild(semResultados);
            
            // Adicionar evento ao botão de limpar filtros
            document.getElementById("btnLimparFiltros").addEventListener('click', limparFiltros);
            elementos.pagina.textContent = "Sem resultados";
        }
        
        // Desabilitar paginação durante exibição de resultado único
        elementos.btnAnterior.disabled = true;
        elementos.btnProximo.disabled = true;
    } catch (erro) {
        console.error("Erro na busca:", erro);
        elementos.dados.innerHTML = '<p>Erro ao buscar: ' + erro.message + '</p>';
    } finally {
        mostrarCarregamento(false);
    }
}

// Função para carregar dados paginados (quando não há filtro ativo)
async function carregarDadosPaginados(direcao = 'proximo') {
    mostrarCarregamento(true);
    
    try {
        let query = db.collection("instituicoes")
                      .orderBy("nome")
                      .limit(docsPorPagina);

        if (direcao === 'proximo' && ultimoDoc) {
            query = query.startAfter(ultimoDoc);
        } else if (direcao === 'anterior' && primeiroDoc) {
            query = query.endBefore(primeiroDoc).limitToLast(docsPorPagina);
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            if (paginaAtual === 1) {
                elementos.dados.innerHTML = '<p>Nenhuma instituição cadastrada.</p>';
            } else {
                paginaAtual--;
                return carregarDadosPaginados('proximo');
            }
            return;
        }

        primeiroDoc = snapshot.docs[0];
        ultimoDoc = snapshot.docs[snapshot.docs.length - 1];

        elementos.dados.innerHTML = '';
        snapshot.forEach(doc => renderizarInstituicao(doc));

        elementos.pagina.textContent = `Página ${paginaAtual}`;
        
        // Verificar se existe página anterior
        elementos.btnAnterior.disabled = paginaAtual === 1;
        
        // Verificar se existe uma próxima página
        const proximaQuery = db.collection("instituicoes")
            .orderBy("nome")
            .startAfter(ultimoDoc)
            .limit(1);
            
        const proximaSnapshot = await proximaQuery.get();
        elementos.btnProximo.disabled = proximaSnapshot.empty;
    } catch (erro) {
        console.error("Erro:", erro);
        elementos.dados.innerHTML = '<p>Erro ao carregar dados: ' + erro.message + '</p>';
    } finally {
        mostrarCarregamento(false);
    }
}

// Função principal que decide qual tipo de carregamento executar
async function carregarDados(direcao = 'proximo', novaConsulta = false) {
    // Reinicia paginação se for uma nova consulta
    if (novaConsulta) {
        paginaAtual = 1;
        ultimoDoc = null;
        primeiroDoc = null;
    }
    
    // Decide se carrega um documento específico ou dados paginados
    if (filtroAtivo) {
        await buscarDocumentoEspecifico();
    } else {
        await carregarDadosPaginados(direcao);
    }
}

// Função para limpar filtros ativos
function limparFiltros() {
    filtroAtivo = null;
    elementos.inputBusca.value = '';
    if (elementos.selectTipoBusca) {
        elementos.selectTipoBusca.value = 'nome';
    }
    carregarDados('proximo', true);
}

// Função de busca que será chamada ao clicar no botão buscar
function realizarBusca() {
    const termoBusca = elementos.inputBusca.value.trim();
    const tipoBusca = elementos.selectTipoBusca ? elementos.selectTipoBusca.value : 'nome';
    
    if (!termoBusca) {
        // Se o campo estiver vazio, limpa os filtros
        limparFiltros();
        return;
    }
    
    // Define o filtro ativo
    filtroAtivo = {
        tipo: tipoBusca,
        valor: termoBusca
    };
    
    // Carrega dados com a nova consulta
    carregarDados('proximo', true);
}

// Eventos existentes
elementos.btnProximo.addEventListener('click', () => {
    paginaAtual++;
    carregarDados('proximo');
});

elementos.btnAnterior.addEventListener('click', () => {
    if (paginaAtual > 1) {
        paginaAtual--;
        carregarDados('anterior');
    }
});

// Novos eventos para busca
if (elementos.btnBuscar) {
    elementos.btnBuscar.addEventListener('click', realizarBusca);
}

// Adicionar evento de submissão do formulário (Enter)
if (elementos.inputBusca) {
    elementos.inputBusca.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            realizarBusca();
        }
    });
}

// Iniciar o carregamento de dados quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
});
