import base64
import re
from time import sleep

import firebase_admin
from bs4 import BeautifulSoup
from firebase_admin import credentials, firestore
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

servico = Service(ChromeDriverManager().install())
options = webdriver.ChromeOptions()
driver = webdriver.Chrome(service=servico, options=options)
wait = WebDriverWait(driver, 30)


def coleta_ies(uf):
    # abrir navegador
    driver.get("https://emec.mec.gov.br/emec/nova")

    # pesquisa por UF
    wait.until(EC.invisibility_of_element_located((By.CLASS_NAME, "loading")))
    dropdown = driver.find_element(By.ID, "sel_sg_uf")
    Select(dropdown).select_by_visible_text(uf)
    driver.find_element(By.ID, "btnPesqAvancada").click()

    # mudanca na paginacao
    dropdown = wait.until(
        EC.presence_of_element_located(
            (By.ID, "paginationItemCountItemdiv_listar_consulta_avancada")
        )
    )
    Select(dropdown).select_by_visible_text("100")
    wait.until(
        EC.invisibility_of_element_located(
            (By.ID, "paginationItemCountItemdiv_listar_consulta_avancada")
        )
    )

    # pagina html
    source = driver.page_source
    site = BeautifulSoup(source, "html.parser")
    tabela = site.find("tbody", id="tbyDados")
    linhas = tabela.find_all("tr")

    # processamento de dados
    dicionario = {}
    for linha in linhas:
        try:
            celulas = [cell.text.strip() for cell in linha.find_all("td")]

            id_raw, nome_raw = celulas[0].split(" ", 1)
            ies_id = re.search(r"\((\d+)\)", id_raw).group(1)
            nome = nome_raw.partition(" - ")[0].upper()
            sigla = celulas[1].replace("\xa0", "").strip()
            local = celulas[2].strip()
            instituicao = celulas[4].split(" ", 1)[0]

            dicionario[ies_id] = {
                "nome": nome,
                "sigla": sigla,
                "instituicao": instituicao,
                "local": local,
                "cursos": {},
            }

        except Exception as e:
            print(f"Erro ao processar linha: {e}")
            continue

    return dicionario


def coleta_cursos(ies_id):
    # codificacao para a url
    cod = base64.b64encode(ies_id.encode()).decode()
    link = f"https://emec.mec.gov.br/emec/consulta-cadastro/detalhamento/d96957f455f6405d14c6542552b0f6eb/{cod}"
    # abir site
    driver.get(link)
    wait.until(EC.invisibility_of_element_located((By.CLASS_NAME, "loading")))

    # mudando de iframe
    iframe = wait.until(EC.presence_of_element_located((By.NAME, "tabIframe2")))
    driver.switch_to.frame(iframe)
    wait.until(EC.invisibility_of_element_located((By.CLASS_NAME, "loading")))
    driver.find_element(By.ID, "cursos").click()

    # verificando se ha cursos
    wait.until(EC.invisibility_of_element_located((By.CLASS_NAME, "loading")))
    tabela_cursos = wait.until(
        EC.presence_of_element_located((By.ID, "divListarCurso"))
    )
    cursos = tabela_cursos.find_element(
        By.XPATH, '//*[@id="listar-ies-cadastro"]/tfoot/tr'
    )
    if cursos.text == "Nenhum registro encontrado.":
        return []

    # mudanca na paginacao
    dropdown = wait.until(
        EC.presence_of_element_located((By.ID, "paginationItemCountItemdivListarCurso"))
    )
    Select(dropdown).select_by_visible_text("1000")
    wait.until(EC.invisibility_of_element_located((By.CLASS_NAME, "loading")))

    # coleta de dados
    source = driver.page_source
    site = BeautifulSoup(source, "html.parser")
    tabela = site.find("div", id="divListarCurso")
    linhas = tabela.find_all("tr", class_=["corDetalhe_2", "corDetalhe_1"])

    cursos = []
    for linha in linhas:
        celulas = [cell.text.strip() for cell in linha.find_all("td")]
        nome = celulas[0]
        curso = {nome: []}
        if "ABI - " not in nome:
            cursos.append(curso)

    return cursos


def coleta_info(ies_id, curso):
    cod = base64.b64encode(ies_id.encode()).decode()
    cod_curso = base64.b64encode(curso.encode("latin-1")).decode()

    # abrir site
    link = f"https://emec.mec.gov.br/emec/consulta-cadastro/detalhamento/d96957f455f6405d14c6542552b0f6eb/{cod}/c1b85ea4d704f246bcced664fdaeddb6/{cod_curso}"

    infos = []
    tentativa = 0

    while tentativa < 6:
        try:
            driver.get(link)
            wait.until(EC.invisibility_of_element_located((By.CLASS_NAME, "loading")))

            # mudando o Iframe
            iframe = driver.find_elements(By.NAME, "tabIframe2")
            driver.switch_to.frame(iframe[1])

            # coletando as informacoes
            wait.until(
                EC.presence_of_element_located(
                    (By.XPATH, '//*[@id="listar-ies-cadastro"]/tbody')
                )
            )
            source = driver.page_source
            site = BeautifulSoup(source, "html.parser")
            tabela = site.find("div", id="div-listar-curso-desagrupado")
            linhas = tabela.find_all("tr", class_=["corDetalhe2", "corDetalhe1"])

            for linha in linhas:
                celulas = [cell.text.strip() for cell in linha.find_all("td")]
                status = str(linha.find("img"))
                if "bolaVerde" in status and len(celulas[4]) != 0:
                    elemento_id = celulas[0]
                    modalidade = celulas[1]
                    grau = celulas[2]
                    clique = driver.find_element(By.ID, f"tr_{elemento_id}")
                    driver.execute_script("arguments[0].click();", clique)

                    wait.until(
                        EC.invisibility_of_element_located((By.CLASS_NAME, "loading"))
                    )
                    detalhes = driver.find_element(By.ID, "div-detalhe-curso")
                    celulas = detalhes.find_elements(By.TAG_NAME, "td")
                    carga_raw = celulas[8].text.split(" ")
                    carga = f"{int(carga_raw[2]) / 2} anos"

                    detalhes = driver.find_element(By.ID, "div-detalhe-curso-cine")
                    area_raw = detalhes.find_element(By.XPATH, '//*[@id="div-detalhe-curso-cine"]/table/tbody/tr[2]/td/table/tbody/tr/td[1]').text
                    area_curso = area_raw[1].strip()

                    itens = {
                        "modalidade": modalidade,
                        "grau": grau,
                        "carga": carga,
                        "area_curso": area_curso,
                    }
                    if itens not in infos:
                        infos.append(itens)

            return infos

        except Exception as e:
            tentativa += 1
            print(e)
            print(link)
            sleep(2)
            driver.refresh()

    print("Deu merda nessa porra")


if __name__ == "__main__":
    cred = credentials.Certificate("credencial.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    colecao_ref = db.collection("newinstituicoes")
    batch = db.batch()

    uf = "Distrito Federal"
    iess = coleta_ies(uf)
    print(f"{len(iess)} ies coletadas do {uf}")

    for ies_id in list(iess.keys()):
        try:
            cursos_raw = coleta_cursos(ies_id)
            cursos_ids = [list(curso.keys())[0] for curso in cursos_raw if curso]
            if not cursos_ids:
                del iess[ies_id]
                continue

            for curso_id in cursos_ids:
                infos = coleta_info(ies_id, curso_id)
                if infos:
                    iess[ies_id]["cursos"][curso_id] = infos
                    print(f"Coletadas {len(infos)} informações para {curso_id}")

            doc_ref = colecao_ref.document(ies_id)
            batch.set(doc_ref, iess[ies_id])

            print(f"Documento {ies_id} pronto para envio")

        except Exception as e:
            print(f"Erro de processamento no Documento {ies_id}: {str(e)}")

    try:
        batch.commit()
        print("Documentos enviados com sucesso")

    except Exception as e:
        print(f"Erro no envio {str(e)}")
