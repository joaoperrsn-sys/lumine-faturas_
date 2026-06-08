
LUMINE FATURAS

Sistema pronto para rodar no VS Code.

COMO RODAR:

1. Extraia esta pasta para:
   C:\Lumine_Faturas

2. Abra no VS Code.

3. No terminal:

   cd C:\Lumine_Faturas
   $env:OPENAI_API_KEY="SUA_CHAVE_OPENAI_AQUI"
   py app.py

4. Abra no navegador:

   http://127.0.0.1:8000

Sem OPENAI_API_KEY, o sistema roda em modo local, mas as funções de IA usam respostas genéricas.

Principais recursos:
- Nome sem número de versão: Lumine Faturas.
- Cálculo de Grupo A e Grupo B em uma única aba.
- Demanda recomendada calculada pela simultaneidade dos aparelhos.
- Cálculo individual dos aparelhos.
- Rotina por texto com IA.
- Reconhecimento por voz.
- Câmera com fechamento automático.
- Busca de aparelhos com IA.
- Upload de fatura PDF com diagnóstico de demanda.
- Exportação em Excel, CSV e PDF.

Atualização: seleção única de tarifas, recomendação automática de melhor tarifa e panorama direto de demanda para Grupo A.

Ajuste: campos de Grupo A só aparecem quando a tarifa Grupo A/Automático é escolhida; Grupo B fica com tarifa final, TUSD e impostos; upload de fatura Grupo A incluído no simulador.
