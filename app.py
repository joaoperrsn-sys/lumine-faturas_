
import csv
import io
import json
import os
import sqlite3
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import Request, urlopen
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

BASE = Path(__file__).parent
PUBLIC = BASE / "public"
ASSETS = BASE / "assets"
DATA = BASE / "data"
DB = DATA / "lumine_faturas.db"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ULTIMA_FATURA = None
ULTIMO_RELATORIO = None

COLUNAS_FATURA = [
    "Ordem", "Item", "Agrupadora", "Descrição", "Nº Cliente", "N° de Contrato",
    "Nº Instalação", "Mês de Referência", "Endereço", "Complemento", "Fase",
    "Classe", "Grupo Tarifário", "Modalidade Tarifária", "Demanda Contratada (kW)",
    "Demanda Medida (kW)", "Demanda Faturada (kW)", "Ultrapassagem Demanda (kW)",
    "Consumo Ponta (kWh)", "Consumo Fora Ponta (kWh)", "Consumo Total (kWh)",
    "Energia Reativa Excedente (kWh)", "Fator de Potência", "PIS (R$)",
    "COFINS (R$)", "ICMS (R$)", "CIP (R$)", "Valor da fatura (R$)", "Observações"
]

def init_db():
    DATA.mkdir(exist_ok=True)
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            empresa TEXT,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS diagnosticos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_email TEXT,
            cliente TEXT,
            dados_json TEXT,
            criado_em TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    con.commit()
    con.close()

def db_query(sql, params=(), one=False):
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows[0] if one and rows else None

def db_execute(sql, params=()):
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute(sql, params)
    con.commit()
    con.close()

def send_bytes(handler, body, ctype, filename=None, status=200):
    handler.send_response(status)
    handler.send_header("Content-Type", ctype)
    if filename:
        handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.end_headers()
    handler.wfile.write(body)

def json_response(handler, obj, status=200):
    send_bytes(handler, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", status=status)

def read_json(handler):
    n = int(handler.headers.get("Content-Length", 0))
    return json.loads(handler.rfile.read(n).decode("utf-8")) if n else {}

def openai_text(resp):
    for item in resp.get("output", []):
        for c in item.get("content", []):
            if c.get("type") in ("output_text", "text"):
                return c.get("text", "")
    return ""

def chamar_ia(content, fallback):
    if not OPENAI_API_KEY:
        return fallback
    payload = {
        "model": "gpt-4.1-mini",
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_object"}}
    }
    try:
        req = Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "Bearer " + OPENAI_API_KEY, "Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=120) as r:
            raw = json.loads(r.read().decode("utf-8"))
        texto = openai_text(raw).strip()
        return json.loads(texto)
    except Exception as e:
        fallback["erro"] = str(e)
        return fallback

def buscar_aparelho(consulta):
    fallback = {
        "ativo": False,
        "resultados": [
            {"nome": consulta or "Aparelho", "potencia_w": 1000, "horas_dia_sugeridas": 4, "dias_mes_sugeridos": 30, "observacao": "IA não configurada. Estimativa genérica para teste."}
        ]
    }
    prompt = f"""
Você é especialista em eficiência energética no Brasil.
Estime potência e uso típico para: {consulta}.
Responda APENAS JSON válido:
{{
  "ativo": true,
  "resultados": [
    {{"nome":"nome do aparelho","potencia_w":1000,"horas_dia_sugeridas":4,"dias_mes_sugeridos":30,"observacao":"observação curta"}}
  ]
}}
Regras:
- Para carros elétricos, considere potência de carregador residencial e consumo de carga, não potência do motor.
- Retorne de 3 a 5 opções quando houver variações.
"""
    return chamar_ia([{"type": "input_text", "text": prompt}], fallback)

def estimar_rotina(descricao, tarifa):
    fallback = {
        "ativo": False,
        "resumo": "IA não configurada. Estimativa padrão.",
        "aparelhos": [
            {"nome": "Ventilador estimado", "potencia_w": 80, "quantidade": 1, "horas_dia": 8, "dias_mes": 30, "hora_inicio": "22:00", "hora_fim": "06:00", "justificativa": "Estimativa padrão sem IA."}
        ],
        "observacoes": ["Configure OPENAI_API_KEY para interpretar a rotina automaticamente."]
    }
    prompt = f"""
Converta esta rotina em aparelhos e consumo mensal.
Rotina: {descricao}
Tarifa atual: {tarifa}
Calcule horários que atravessam madrugada. Ex.: 19:30 até 7:30 = 12h.
Responda APENAS JSON válido:
{{
 "ativo":true,
 "resumo":"resumo curto",
 "aparelhos":[
   {{"nome":"aparelho","potencia_w":100,"quantidade":1,"horas_dia":8,"dias_mes":30,"hora_inicio":"19:00","hora_fim":"23:00","justificativa":"motivo"}}
 ],
 "observacoes":["observação"]
}}
"""
    return chamar_ia([{"type": "input_text", "text": prompt}], fallback)

def reconhecer_foto(imagem):
    fallback = {
        "ativo": False,
        "resultados": [
            {"nome": "Aparelho pela foto", "potencia_w": 1000, "horas_dia_sugeridas": 4, "dias_mes_sugeridos": 30, "observacao": "IA não configurada ou imagem não analisada."}
        ]
    }
    prompt = """
Identifique o aparelho ou etiqueta da imagem e estime potência.
Responda APENAS JSON válido:
{"ativo":true,"resultados":[{"nome":"aparelho","potencia_w":1000,"horas_dia_sugeridas":4,"dias_mes_sugeridos":30,"observacao":"observação"}]}
"""
    return chamar_ia([{"type": "input_text", "text": prompt}, {"type": "input_image", "image_url": imagem}], fallback)

def extrair_fatura(pdf_data):
    global ULTIMA_FATURA
    fallback = {
        "ativo": False,
        "resumo": "IA não configurada. Não foi possível organizar o PDF.",
        "linhas": [{c: "" for c in COLUNAS_FATURA}],
        "diagnostico": {
            "situacao": "IA não configurada",
            "demanda_ideal": "",
            "recomendacoes": ["Configure OPENAI_API_KEY para análise de fatura."]
        }
    }
    fallback["linhas"][0].update({"Ordem": 1, "Item": 1, "Descrição": "Fatura não extraída", "Observações": "Configure OPENAI_API_KEY."})
    prompt = f"""
Extraia dados desta fatura de energia em PDF e organize nas colunas:
{json.dumps(COLUNAS_FATURA, ensure_ascii=False)}

Além da tabela, gere um panorama direto de Grupo A quando aplicável:
- Se a demanda contratada estiver muito acima da demanda medida, diga: "A sua demanda contratada é superior ao uso observado. Avalie reduzir a demanda contratada."
- Se a demanda contratada estiver abaixo ou muito próxima da demanda medida, diga: "A sua demanda contratada está baixa para o uso observado. Avalie aumentar a demanda para evitar ultrapassagens."
- Se estiver adequada, diga: "A sua demanda contratada está adequada ao perfil atual."
- Informe se há ultrapassagem.
- Informe se há energia reativa excedente.
- Informe se é melhor redistribuir consumo.
- Informe economia potencial quando possível.

Responda APENAS JSON válido:
{{
 "ativo": true,
 "resumo": "resumo",
 "linhas": [{{"Ordem":1}}],
 "diagnostico": {{
   "situacao":"adequada/superior ao uso/baixa",
   "panorama":"frase objetiva para o cliente",
   "demanda_ideal":"valor recomendado",
   "economia_potencial":"valor se possível",
   "recomendacoes":["recomendação 1"]
 }}
}}
"""
    res = chamar_ia([{"type": "input_text", "text": prompt}, {"type": "input_file", "filename": "fatura.pdf", "file_data": pdf_data}], fallback)
    linhas = []
    for i, r in enumerate(res.get("linhas", []), 1):
        row = {c: r.get(c, "") for c in COLUNAS_FATURA}
        row["Ordem"] = row.get("Ordem") or i
        row["Item"] = row.get("Item") or i
        linhas.append(row)
    res["linhas"] = linhas
    ULTIMA_FATURA = res
    return res

def diagnostico(dados):
    fallback = {
        "ativo": False,
        "titulo": "IA não configurada",
        "resumo": "O sistema está em modo local.",
        "prioridades": ["Configure OPENAI_API_KEY para diagnóstico com IA."],
        "oportunidades": ["Use os cálculos locais de consumo e demanda."]
    }
    prompt = f"""
Você é consultor da Luminê Gestora de Energia.
Analise estes dados de consumo/fatura e responda JSON:
{{
 "ativo":true,
 "titulo":"Diagnóstico Luminê",
 "resumo":"resumo executivo",
 "prioridades":["..."],
 "oportunidades":["..."],
 "alertas":["..."]
}}
Dados:
{json.dumps(dados, ensure_ascii=False)}
"""
    return chamar_ia([{"type": "input_text", "text": prompt}], fallback)

def csv_bytes(rows):
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=COLUNAS_FATURA, delimiter=";")
    w.writeheader()
    for r in rows:
        w.writerow({c: r.get(c, "") for c in COLUNAS_FATURA})
    return out.getvalue().encode("utf-8-sig")

def xlsx_bytes(rows):
    def cn(n):
        s = ""
        while n:
            n, rem = divmod(n - 1, 26)
            s = chr(65 + rem) + s
        return s

    def cell(v, r, c):
        txt = escape(str(v if v is not None else ""))
        return f'<c r="{cn(c)}{r}" t="inlineStr"><is><t>{txt}</t></is></c>'

    rows_xml = ['<row r="1"><c r="A1" t="inlineStr"><is><t>Relatório de Faturas - Lumine Faturas</t></is></c></row>']
    rows_xml.append('<row r="2">' + ''.join(cell(h, 2, i+1) for i, h in enumerate(COLUNAS_FATURA)) + '</row>')
    for ridx, row in enumerate(rows, 3):
        rows_xml.append(f'<row r="{ridx}">' + ''.join(cell(row.get(c, ""), ridx, i+1) for i, c in enumerate(COLUNAS_FATURA)) + '</row>')

    sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(rows_xml) + '</sheetData></worksheet>'
    wb = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Faturas Organizadas" sheetId="1" r:id="rId1"/></sheets></workbook>'
    rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    wbrels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'

    bio = io.BytesIO()
    with ZipFile(bio, "w", ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/_rels/workbook.xml.rels", wbrels)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return bio.getvalue()

def pdf_bytes(rows):
    body = "Lumine Faturas - Relatório de Faturas\\n\\n"
    for i, r in enumerate(rows, 1):
        body += f"Fatura {i}\\n"
        for c in COLUNAS_FATURA:
            if r.get(c, ""):
                body += f"{c}: {r.get(c)}\\n"
        body += "\\n"
    safe = body.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    lines, y = [], 780
    for line in safe.split("\\n")[:60]:
        lines.append(f"BT /F1 9 Tf 40 {y} Td ({line[:100]}) Tj ET")
        y -= 12
    content = "\\n".join(lines).encode("latin-1", "replace")
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
        f"<< /Length {len(content)} >>\\nstream\\n{content.decode('latin-1')}\\nendstream"
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for i, o in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n{o}\nendobj\n".encode("latin-1", "replace"))
    xref = out.tell()
    out.write(f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode())
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return out.getvalue()

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        routes = {
    "/": "login.html",
    "": "login.html",
    "/index.html": "login.html",
    "/login.html": "login.html",
        }
        ctypes = {"html": "text/html; charset=utf-8", "css": "text/css; charset=utf-8", "js": "application/javascript; charset=utf-8"}

        if self.path in routes:
    fn = routes[self.path]
    ext = fn.split(".")[-1]
    p = PUBLIC / fn
    if p.exists():
        return send_bytes(self, p.read_bytes(), ctypes.get(ext, "text/plain"))
    return send_bytes(self, f"Arquivo não encontrado: {p}".encode("utf-8"), "text/plain", status=404)

        rows = (ULTIMA_FATURA or {}).get("linhas", [])
        if self.path == "/download/fatura.xlsx":
            return send_bytes(self, xlsx_bytes(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "faturas_organizadas.xlsx")
        if self.path == "/download/fatura.csv":
            return send_bytes(self, csv_bytes(rows), "text/csv; charset=utf-8", "faturas_organizadas.csv")
        if self.path == "/download/fatura.pdf":
            return send_bytes(self, pdf_bytes(rows), "application/pdf", "faturas_organizadas.pdf")

        if self.path in routes:
            fn = routes[self.path]
            ext = fn.split(".")[-1]
            return send_bytes(self, (PUBLIC / fn).read_bytes(), ctypes.get(ext, "text/plain"))

        return send_bytes(self, b"Pagina nao encontrada", "text/plain", status=404)

    def do_POST(self):
        try:
            data = read_json(self)

            if self.path == "/api/criar-usuario":
                nome = data.get("nome", "").strip()
                empresa = data.get("empresa", "")
                email = data.get("email", "").strip().lower()
                senha = data.get("senha", "")
                if not nome or not email or not senha:
                    return json_response(self, {"ok": False, "erro": "Preencha nome, e-mail e senha."}, 400)
                try:
                    db_execute("INSERT INTO usuarios (nome,empresa,email,senha) VALUES (?,?,?,?)", (nome, empresa, email, senha))
                except sqlite3.IntegrityError:
                    return json_response(self, {"ok": False, "erro": "E-mail já cadastrado."}, 400)
                return json_response(self, {"ok": True, "usuario": {"nome": nome, "empresa": empresa, "email": email}})

            if self.path == "/api/login":
                u = db_query("SELECT nome,empresa,email FROM usuarios WHERE email=? AND senha=?", (data.get("email", "").strip().lower(), data.get("senha", "")), one=True)
                return json_response(self, {"ok": bool(u), "usuario": u, "erro": None if u else "E-mail ou senha inválidos."}, 200 if u else 401)

            if self.path == "/api/buscar-aparelho":
                return json_response(self, buscar_aparelho(data.get("consulta", "").strip()))

            if self.path == "/api/estimar-rotina":
                return json_response(self, estimar_rotina(data.get("descricao", "").strip(), data.get("tarifa", 1.25813)))

            if self.path == "/api/reconhecer-foto":
                return json_response(self, reconhecer_foto(data.get("imagem", "")))

            if self.path == "/api/extrair-fatura-pdf":
                return json_response(self, extrair_fatura(data.get("pdf", "")))

            if self.path == "/api/diagnostico-ia":
                return json_response(self, diagnostico(data))

            if self.path == "/api/salvar-diagnostico":
                db_execute("INSERT INTO diagnosticos (usuario_email,cliente,dados_json) VALUES (?,?,?)", (data.get("usuario_email", ""), data.get("cliente", ""), json.dumps(data, ensure_ascii=False)))
                return json_response(self, {"ok": True})

            return json_response(self, {"ok": False, "erro": "Rota não encontrada."}, 404)

        except Exception as e:
            return json_response(self, {"ok": False, "erro": str(e)}, 500)

if __name__ == "__main__":
    init_db()
    print("Lumine Faturas")
    print("Servidor: http://127.0.0.1:8000")
    print("Cálculos com IA opcionais: configure OPENAI_API_KEY")
    PORT = int(os.environ.get("PORT", 8000))
HTTPServer(("0.0.0.0", PORT), H).serve_forever()
