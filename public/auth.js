
function usuarioAtual(){return JSON.parse(localStorage.getItem("lumine_usuario")||"null")}
function salvarUsuarioLocal(u){localStorage.setItem("lumine_usuario",JSON.stringify(u))}
async function criarUsuario(){
 const data={nome:cadNome.value.trim(),empresa:cadEmpresa.value.trim(),email:cadEmail.value.trim().toLowerCase(),senha:cadSenha.value}
 const r=await fetch("/api/criar-usuario",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)})
 const j=await r.json(); if(!j.ok){alert(j.erro||"Erro.");return}
 salvarUsuarioLocal(j.usuario); location.href="/app.html"
}
async function login(){
 const data={email:loginEmail.value.trim().toLowerCase(),senha:loginSenha.value}
 const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)})
 const j=await r.json(); if(!j.ok){alert(j.erro||"Erro no login.");return}
 salvarUsuarioLocal(j.usuario); location.href="/app.html"
}
function sair(){localStorage.removeItem("lumine_usuario");location.href="/login.html"}
function proteger(){
 if(location.pathname.endsWith("/app.html")){
  const u=usuarioAtual(); if(!u){location.href="/login.html";return}
  usuarioNome.textContent=u.nome; usuarioEmail.textContent=u.email
 }
}
addEventListener("load",proteger)
