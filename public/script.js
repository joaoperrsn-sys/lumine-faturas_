
const aparelhosBase=[
 ["Ar-condicionado 9.000 BTU",900,8,30,"22:00","06:00"],
 ["Ar-condicionado 12.000 BTU",1200,8,30,"22:00","06:00"],
 ["Ar-condicionado 18.000 BTU",1800,8,30,"22:00","06:00"],
 ["Geladeira",150,24,30,"00:00","23:59"],
 ["Freezer",250,24,30,"00:00","23:59"],
 ["Chuveiro elétrico",5500,0.5,30,"19:00","19:30"],
 ["TV LED",100,5,30,"19:00","00:00"],
 ["Ventilador",80,8,30,"22:00","06:00"],
 ["Roteador Wi-Fi",12,24,30,"00:00","23:59"],
 ["Lâmpada LED",9,5,30,"18:00","23:00"],
 ["Micro-ondas",1400,0.3,30,"12:00","12:20"],
 ["Air Fryer",1500,0.5,20,"19:00","19:30"],
 ["Máquina de lavar",500,1,12,"09:00","10:00"],
 ["BYD Dolphin carregador residencial",7400,4,20,"22:00","02:00"],
 ["Outro aparelho",1000,1,30,"08:00","09:00"]
];

let aparelhos=[],ultimaRotina=[],ultimoResultado=null,vozAtiva=false,reconhecimentoVoz=null;

function id(x){return document.getElementById(x)}
function num(x){return Number(id(x)?.value||0)}
function val(x){return id(x)?.value||""}
function moeda(v){return"R$ "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}
function usuarioAtual(){return JSON.parse(localStorage.getItem("lumine_usuario")||"null")}


function alternarCamposTarifa(){
 const m=val("tarifaSelecionada");
 const mostrarBranca=(m==="auto"||m==="branca");
 const mostrarA=(m==="auto"||m==="verde"||m==="azul");
 if(id("camposTarifaBranca")) id("camposTarifaBranca").classList.toggle("hidden",!mostrarBranca);
 if(id("camposGrupoA")) id("camposGrupoA").classList.toggle("hidden",!mostrarA);
}

function iniciar(){
 aparelhosBase.forEach((a,i)=>{let o=document.createElement("option");o.value=i;o.textContent=a[0];id("aparelhoSelect").appendChild(o)})
 ;[1,3,7,8,9].forEach(i=>adicionarModelo(i,false))
 document.querySelectorAll("input,select").forEach(e=>{if(!["fotoArquivo","pdfFatura","buscaAparelho"].includes(e.id))e.addEventListener("input",calcular)})
 alternarCamposTarifa();
 render()
}
function adicionarModelo(i,recalc=true){const a=aparelhosBase[i];aparelhos.push({nome:a[0],qtd:1,potencia:a[1],horas:a[2],dias:a[3],inicio:a[4],fim:a[5]});if(recalc)render()}
function horaParaMin(h){if(!h||!h.includes(":"))return 0;const [hh,mm]=h.split(":").map(Number);return hh*60+(mm||0)}
function duracaoHoras(inicio,fim){let a=horaParaMin(inicio),b=horaParaMin(fim);if(b<=a)b+=1440;return (b-a)/60}
function kwhItem(a){const horas=Number(a.horas||duracaoHoras(a.inicio,a.fim)||0);return a.qtd*(a.potencia/1000)*horas*a.dias}
function kwItem(a){return a.qtd*(a.potencia/1000)}
function adicionarAparelho(){adicionarModelo(Number(val("aparelhoSelect")))}
function adicionarAparelhoManual(nome,potencia,horas,dias,inicio="08:00",fim="09:00"){aparelhos.push({nome,qtd:1,potencia:Number(potencia),horas:Number(horas),dias:Number(dias),inicio,fim});render();location.hash="#aparelhos"}
function limparAparelhos(){aparelhos=[];render()}
function remover(i){aparelhos.splice(i,1);render()}
function atualizar(i,c,v){aparelhos[i][c]=["nome","inicio","fim"].includes(c)?v:Number(v||0);if(c==="inicio"||c==="fim")aparelhos[i].horas=Number(duracaoHoras(aparelhos[i].inicio,aparelhos[i].fim).toFixed(2));render(false);calcular()}
function render(recalc=true){
 id("listaAparelhos").innerHTML=""
 aparelhos.forEach((a,i)=>{id("listaAparelhos").innerHTML+=`<tr>
  <td><input class="nome" value="${a.nome}" onchange="atualizar(${i},'nome',this.value)"></td>
  <td><input type="number" value="${a.qtd}" onchange="atualizar(${i},'qtd',this.value)"></td>
  <td><input type="number" value="${a.potencia}" onchange="atualizar(${i},'potencia',this.value)"></td>
  <td><input type="number" step="0.1" value="${a.horas}" onchange="atualizar(${i},'horas',this.value)"></td>
  <td><input type="number" value="${a.dias}" onchange="atualizar(${i},'dias',this.value)"></td>
  <td><input type="time" value="${a.inicio}" onchange="atualizar(${i},'inicio',this.value)"></td>
  <td><input type="time" value="${a.fim}" onchange="atualizar(${i},'fim',this.value)"></td>
  <td>${kwhItem(a).toFixed(2)}</td>
  <td><button onclick="remover(${i})">Remover</button></td></tr>`})
 if(recalc)calcular()
}
function tributos(base){const pisP=num("pis"),cofinsP=num("cofins"),icmsP=num("icmsManual");const divisor=Math.max(0.01,1-pisP/100-cofinsP/100-icmsP/100);const total=base/divisor;return{total,pis:total*pisP/100,cofins:total*cofinsP/100,icms:total*icmsP/100}}
function consumoPorPeriodo(){
 let ponta=0, inter=0, fora=0
 aparelhos.forEach(a=>{
  const kwh=kwhItem(a), ini=horaParaMin(a.inicio), fim=horaParaMin(a.fim)
  const usaPonta=(ini<=21*60 && (fim>=18*60 || fim<ini))
  if(usaPonta){ponta+=kwh*0.35;inter+=kwh*0.20;fora+=kwh*0.45}else{fora+=kwh}
 })
 return{ponta,inter,fora,total:ponta+inter+fora}
}
function calcularDemandaSilencioso(){
 let max=0
 for(let t=0;t<1440;t+=15){
  let soma=0
  aparelhos.forEach(a=>{let ini=horaParaMin(a.inicio),fim=horaParaMin(a.fim),ativo=false;if(fim<=ini){ativo=(t>=ini||t<fim)}else{ativo=(t>=ini&&t<fim)}if(ativo)soma+=kwItem(a)})
  if(soma>max)max=soma
 }
 const tipo=val("tipoCliente")
 const margem=tipo==="residencial"?0.10:tipo==="comercial"?0.15:tipo==="empresarial"?0.20:0.25
 return{max,media:aparelhos.reduce((s,a)=>s+kwItem(a),0)/Math.max(1,aparelhos.length),recomendada:Math.ceil(max*(1+margem)),margem}
}
function custoTarifas(){
 const c=consumoPorPeriodo(), kwhTotal=aparelhos.reduce((s,a)=>s+kwhItem(a),0)
 const convencional=kwhTotal*num("tarifaFinal")
 const branca=(c.ponta*num("tarifaBrancaPonta"))+(c.inter*num("tarifaBrancaIntermediario"))+(c.fora*num("tarifaBrancaForaPonta"))
 const verde=kwhTotal*num("tarifaVerde")
 const azul=(c.ponta*num("tarifaAzulPonta"))+((c.inter+c.fora)*num("tarifaAzulFora"))
 return{convencional,branca,verde,azul,periodos:c,kwhTotal}
}
function tarifaIdeal(custos){
 const itens=[
  ["Grupo B Convencional",custos.convencional],
  ["Grupo B Tarifa Branca",custos.branca],
  ["Grupo A Verde",custos.verde],
  ["Grupo A Azul",custos.azul]
 ].sort((a,b)=>a[1]-b[1])
 return{nome:itens[0][0],valor:itens[0][1],lista:itens}
}
function panoramaDemanda(dem){
 const contratada=num("demandaContratadaAtual"), medida=num("demandaMedidaAtual")||dem.max
 if(!contratada && !medida)return "Informe a demanda contratada atual ou envie uma fatura do Grupo A para um panorama mais preciso."
 if(contratada>0 && medida>0){
  if(contratada>medida*1.25)return "A sua demanda contratada é superior ao uso observado. Avalie reduzir a demanda contratada."
  if(contratada<medida*1.05)return "A sua demanda contratada está baixa para o uso observado. Avalie aumentar a demanda para evitar ultrapassagens."
  return "A sua demanda contratada está adequada ao perfil atual."
 }
 return "Com base nos aparelhos, a demanda recomendada estimada é "+dem.recomendada+" kW."
}
function calcular(){
 const custos=custoTarifas(), escolha=val("tarifaSelecionada")
 const ideal=tarifaIdeal(custos)
 let base=ideal.valor
 if(escolha==="convencional")base=custos.convencional
 if(escolha==="branca")base=custos.branca
 if(escolha==="verde")base=custos.verde
 if(escolha==="azul")base=custos.azul
 const t=tributos(base), total=t.total+num("cip")+num("outros"), dem=calcularDemandaSilencioso()
 ultimoResultado={cliente:val("cliente"),tarifaSelecionada:escolha,tarifaIdeal:ideal,base,total,kwhAparelhos:custos.kwhTotal,demanda:dem,aparelhos}
 id("resultado").innerHTML=
  m("Consumo estimado",custos.kwhTotal.toFixed(2)+" kWh")+
  m("Tarifa recomendada",ideal.nome)+
  m("Custo energia",moeda(base))+
  m("PIS",moeda(t.pis))+
  m("COFINS",moeda(t.cofins))+
  m("ICMS",moeda(t.icms))+
  m("Total estimado",moeda(total))+
  m("Demanda máxima",dem.max.toFixed(2)+" kW")+
  m("Demanda recomendada",dem.recomendada+" kW")
 id("comparativoTarifas").innerHTML="<h3>Comparativo de tarifas</h3><ol>"+ideal.lista.map(x=>`<li><b>${x[0]}</b>: ${moeda(x[1])} antes dos tributos</li>`).join("")+"</ol>"
 id("panoramaGrupoA").innerHTML="<h3>Panorama Grupo A</h3><p>"+panoramaDemanda(dem)+"</p><p>Se houver fatura PDF do Grupo A, envie na seção de fatura para diagnóstico com IA.</p>"
 mostrarRanking()
 return ultimoResultado
}
function calcularAparelhoSelecionado(){
 if(!aparelhos.length){alert("Adicione um aparelho primeiro.");return}
 const a=aparelhos[aparelhos.length-1],custo=kwhItem(a)*num("tarifaFinal")
 id("resultadoAparelho").innerHTML=`<h3>Cálculo do último aparelho</h3><p><b>${a.nome}</b></p><p>Consumo: <b>${kwhItem(a).toFixed(2)} kWh/mês</b></p><p>Custo estimado: <b>${moeda(custo)}/mês</b></p><p>Demanda individual: <b>${kwItem(a).toFixed(2)} kW</b></p>`
}
function calcularDemanda(){const dem=calcularDemandaSilencioso();id("resultadoAparelho").innerHTML=`<h3>Demanda estimada</h3><p>Demanda máxima simultânea: <b>${dem.max.toFixed(2)} kW</b></p><p>Margem aplicada: <b>${(dem.margem*100).toFixed(0)}%</b></p><p>Demanda recomendada: <b>${dem.recomendada} kW</b></p><p>${panoramaDemanda(dem)}</p>`;calcular()}
function m(t,v){return`<div class="metric"><strong>${t}</strong><span>${v}</span></div>`}
function mostrarRanking(){id("ranking").innerHTML="<h3>Top consumidores</h3><ol>"+[...aparelhos].sort((a,b)=>kwhItem(b)-kwhItem(a)).map(a=>`<li><b>${a.nome}</b>: ${kwhItem(a).toFixed(2)} kWh/mês</li>`).join("")+"</ol>"}

function alternarVoz(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("Use Chrome ou Edge para reconhecimento de voz.");return}if(!vozAtiva){reconhecimentoVoz=new SR();reconhecimentoVoz.lang="pt-BR";reconhecimentoVoz.continuous=true;reconhecimentoVoz.interimResults=false;reconhecimentoVoz.onresult=e=>{let texto="";for(let i=e.resultIndex;i<e.results.length;i++)texto+=e.results[i][0].transcript+" ";id("descricaoRotina").value+=(id("descricaoRotina").value?" ":"")+texto.trim()};reconhecimentoVoz.onend=()=>{if(vozAtiva)reconhecimentoVoz.start()};vozAtiva=true;id("botaoVoz").textContent="⏹️ Desativar áudio";reconhecimentoVoz.start()}else{vozAtiva=false;id("botaoVoz").textContent="🎙️ Ativar áudio";if(reconhecimentoVoz)reconhecimentoVoz.stop()}}
async function estimarRotinaIA(){id("resultadoRotina").innerHTML="<p>Interpretando rotina com IA...</p>";const r=await fetch("/api/estimar-rotina",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({descricao:val("descricaoRotina"),tarifa:num("tarifaFinal")})});const d=await r.json();ultimaRotina=d.aparelhos||[];id("resultadoRotina").innerHTML="<p>"+(d.resumo||"")+"</p>"+ultimaRotina.map((x,i)=>`<div class="search-item"><h3>${x.nome}</h3><p>${x.potencia_w} W | ${x.horas_dia}h/dia | ${x.dias_mes} dias</p><p>${x.justificativa||""}</p><button onclick="adicionarDaRotina(${i})">Adicionar</button></div>`).join("")}
function adicionarDaRotina(i){let x=ultimaRotina[i];if(x)adicionarAparelhoManual(x.nome,x.potencia_w,x.horas_dia,x.dias_mes,x.hora_inicio||"08:00",x.hora_fim||"09:00")}
function adicionarTodosDaRotina(){ultimaRotina.forEach(x=>adicionarAparelhoManual(x.nome,x.potencia_w,x.horas_dia,x.dias_mes,x.hora_inicio||"08:00",x.hora_fim||"09:00"))}
async function buscarAparelhoIA(){id("resultadoBusca").innerHTML="<p>Buscando com IA...</p>";const r=await fetch("/api/buscar-aparelho",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({consulta:val("buscaAparelho")})});const d=await r.json();id("resultadoBusca").innerHTML=(d.resultados||[]).map(x=>cardAparelho(x)).join("")}
function cardAparelho(x){const nome=String(x.nome||"Aparelho").replaceAll("'","\\'");const pot=Number(x.potencia_w||1000),h=Number(x.horas_dia_sugeridas||x.horas_dia||1),dias=Number(x.dias_mes_sugeridos||x.dias_mes||30);return`<div class="search-item"><h3>${x.nome}</h3><p>${pot} W | ${h}h/dia | ${dias} dias/mês</p><p>${x.observacao||""}</p><button onclick="adicionarAparelhoManual('${nome}',${pot},${h},${dias})">Adicionar</button></div>`}
async function abrirCamera(){try{let s=await navigator.mediaDevices.getUserMedia({video:true});id("videoCamera").srcObject=s;id("videoCamera").classList.remove("hidden")}catch(e){alert("Erro na câmera: "+e.message)}}
function capturarFoto(){let v=id("videoCamera"),c=id("canvasFoto");if(!v.srcObject){alert("Abra a câmera primeiro.");return}c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);c.classList.remove("hidden");let img=c.toDataURL("image/jpeg",0.85);v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;v.classList.add("hidden");analisarImagemDataURL(img)}
function analisarFotoArquivo(){let f=id("fotoArquivo").files[0];if(!f){alert("Escolha uma foto.");return}let r=new FileReader();r.onload=()=>analisarImagemDataURL(r.result);r.readAsDataURL(f)}
async function analisarImagemDataURL(img){id("resultadoFoto").innerHTML="<p>Analisando foto...</p>";const r=await fetch("/api/reconhecer-foto",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imagem:img})});const d=await r.json();id("resultadoFoto").innerHTML=(d.resultados||[]).map(x=>cardAparelho(x)).join("")}

async function extrairFaturaPDFGrupoA(){
 let input=id("pdfFaturaGrupoA");
 let f=input && input.files ? input.files[0] : null;
 if(!f){alert("Escolha uma fatura PDF do Grupo A.");return}
 id("resultadoPDFGrupoA").innerHTML="<p>Analisando fatura Grupo A com IA...</p>";
 let rd=new FileReader();
 rd.onload=async()=>{
  let r=await fetch("/api/extrair-fatura-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pdf:rd.result})});
  let d=await r.json();
  let diag=d.diagnostico||{};
  let linhas=d.linhas||[];
  let primeira=linhas[0]||{};
  if(primeira["Demanda Contratada (kW)"]) id("demandaContratadaAtual").value=primeira["Demanda Contratada (kW)"];
  if(primeira["Demanda Medida (kW)"]) id("demandaMedidaAtual").value=primeira["Demanda Medida (kW)"];
  if(primeira["Valor da fatura (R$)"]) id("valorFaturaAtual").value=primeira["Valor da fatura (R$)"];
  id("resultadoPDFGrupoA").innerHTML=`<h3>Panorama da demanda</h3><p><b>${diag.panorama||diag.situacao||""}</b></p><p><b>Demanda ideal:</b> ${diag.demanda_ideal||""}</p><p><b>Economia potencial:</b> ${diag.economia_potencial||""}</p>${diag.recomendacoes?("<ul>"+diag.recomendacoes.map(x=>"<li>"+x+"</li>").join("")+"</ul>"):""}<p>${d.resumo||""}</p>`;
  calcular();
 };
 rd.readAsDataURL(f);
}

async function extrairFaturaPDF(){let f=id("pdfFatura").files[0];if(!f){alert("Escolha uma fatura PDF.");return}id("resultadoPDF").innerHTML="<p>Organizando PDF com IA...</p>";let rd=new FileReader();rd.onload=async()=>{let r=await fetch("/api/extrair-fatura-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pdf:rd.result})});let d=await r.json();let diag=d.diagnostico||{};id("resultadoPDF").innerHTML=`<p>${d.resumo||""}</p><p>${((d.linhas||[]).length)} linha(s) extraída(s)</p><h3>Panorama da demanda</h3><p><b>${diag.panorama||diag.situacao||""}</b></p><p><b>Demanda ideal:</b> ${diag.demanda_ideal||""}</p><p><b>Economia potencial:</b> ${diag.economia_potencial||""}</p>${diag.recomendacoes?("<ul>"+diag.recomendacoes.map(x=>"<li>"+x+"</li>").join("")+"</ul>"):""}`;id("downloadsPDF").classList.remove("hidden")};rd.readAsDataURL(f)}
async function salvarDiagnostico(){const dados=calcular();dados.usuario_email=usuarioAtual()?.email||"";await fetch("/api/salvar-diagnostico",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(dados)});alert("Diagnóstico salvo.")}
async function gerarDiagnosticoIA(){id("diagnosticoIA").innerHTML="<p>Gerando diagnóstico...</p>";let r=await fetch("/api/diagnostico-ia",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(calcular())});let d=await r.json();id("diagnosticoIA").innerHTML="<h3>"+(d.titulo||"Diagnóstico Luminê")+"</h3><p>"+(d.resumo||"")+"</p>"+(d.prioridades?("<h4>Prioridades</h4><ul>"+d.prioridades.map(x=>"<li>"+x+"</li>").join("")+"</ul>"):"")+(d.oportunidades?("<h4>Oportunidades</h4><ul>"+d.oportunidades.map(x=>"<li>"+x+"</li>").join("")+"</ul>"):"")}
addEventListener("load",iniciar)
