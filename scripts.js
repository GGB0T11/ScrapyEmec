const firebaseConfig = {
    apiKey: "AIzaSyCcIT5FXDZPhg45GlEJCcqzLbSXmmeqdAA",
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

const elementos = {
    dados: document.getElementById("dados"),
    btnAnterior: document.getElementById("btnAnterior"),
    btnProximo: document.getElementById("btnProximo"),
    pagina: document.getElementById("paginaAtual"),
    templateInstituicao: document.getElementById("template-instituicao"),
    templateCurso: document.getElementById("template-curso"),
    statusCarregamento: document.getElementById("status-carregamento")
};

// Função para mostrar/ocultar o indicador de carregamento
function mostrarCarregamento(exibir = true) {
    elementos.statusCarregamento.style.display = exibir ? "block" : "none";
}

async function carregarDados(direcao = 'proximo') {
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
            elementos.dados.innerHTML = '<p>Nenhum resultado encontrado</p>';
            return;
        }

        primeiroDoc = snapshot.docs[0];
        ultimoDoc = snapshot.docs[snapshot.docs.length - 1];

        elementos.dados.innerHTML = '';

        snapshot.forEach(doc => renderizarInstituicao(doc));

        elementos.pagina.textContent = `Página ${paginaAtual}`;
        
        // Verificar se existe página anterior e próxima
        elementos.btnAnterior.disabled = paginaAtual === 1;
        
        // Verificar se existe uma próxima página
        if (direcao !== 'anterior') {
            const proximaQuery = db.collection("instituicoes")
                .orderBy("nome")
                .startAfter(ultimoDoc)
                .limit(1);
                
            const proximaSnapshot = await proximaQuery.get();
            elementos.btnProximo.disabled = proximaSnapshot.empty;
        }

    } catch (erro) {
        console.error("Erro:", erro);
        elementos.dados.innerHTML = '<p>Erro ao carregar dados</p>';
    } finally {
        mostrarCarregamento(false);
    }
}

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

// Iniciar o carregamento de dados quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
});
