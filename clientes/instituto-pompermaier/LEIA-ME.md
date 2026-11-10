# Instituto Pompermaier: site + painel

## Endereços

| Endereço | O que é | Quem acessa |
|---|---|---|
| `/` | Site completo | Pacientes |
| `/i/codigo` | Convite de indicação personalizado ("Fulana indicou você") | Quem recebe o link |
| `/orcamento/?id=…` | Orçamento da paciente, com vídeo e aprovação | Só quem recebe o link |
| `/painel` | Painel do Instituto | Dra. Talita e equipe, com senha |

## O que já está ligado

- **Agendamento:** o formulário do site cai na Agenda e no Funil do painel. Quem envia foto aparece como "Agendamento com foto". A equipe confirma o horário e a mensagem do WhatsApp sai pronta.
- **Orçamento com vídeo:** criado no painel, com vídeo gravado na hora ou enviado de um arquivo. A paciente abre o link, assiste, escolhe a opção (parcelado ou Pix) e aprova. O painel mostra quem abriu e quem aprovou.
- **Indicações:** na seção "Indique" do site, a pessoa coloca nome e WhatsApp e recebe um convite pessoal (`/i/codigo`). Quem abre vê o convite com o nome de quem indicou. Se agendar em até 60 dias, o contato chega no Funil marcado como indicação. A tela Indicações mostra cliques, indicados e agendados por pessoa, com botão para agradecer e marcar o cuidado especial como entregue.
- **Exemplos:** Reativação, Avaliações e Automações mostram dados de exemplo. Elas dependem da integração com o WhatsApp Business, que é a próxima fase.
- **Dados de exemplo:** a chave no canto inferior da barra lateral liga e desliga os dados fictícios, para demonstrar o painel sem misturar com os contatos reais.

## Configuração na Vercel (uma vez)

1. Crie um projeto novo e arraste esta pasta (ou o zip) para publicar.
2. Em **Storage**, crie e conecte ao projeto:
   - **Blob** (fotos e vídeos dos orçamentos);
   - **Upstash** Redis, plano Free (banco de dados).
3. Em **Settings → Environment Variables**, crie `PAINEL_SENHA` com a senha do painel.
4. Confira se apareceram `BLOB_READ_WRITE_TOKEN` e `KV_REST_API_URL` / `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
5. Publique de novo (Redeploy) para as variáveis valerem.

## Testar antes de configurar o banco

Dá para arrastar o zip na Vercel e testar na hora, antes do passo 2. Sem banco, o painel entra no modo de exemplo com qualquer senha, e a gravação do vídeo no orçamento já funciona (no Mac e no celular). Os orçamentos criados assim ficam só na aba aberta.

## Teste rápido

1. Abra o site, clique em **Agendar avaliação** e preencha.
2. Abra `/painel`, entre com a senha e vá em **Agenda**. O pedido deve estar lá.
3. Clique em **Confirmar e avisar** para abrir o WhatsApp com a mensagem pronta.
4. No **Funil**, abra o contato e clique em **Criar orçamento**. Grave o vídeo, preencha os valores e crie.
5. Abra o link do orçamento no celular e aprove. No painel, o status muda para **Aprovado**.
6. Na seção **Indique** do site, gere um convite e abra o link em outro aparelho. Agende por ele e veja a indicação no painel.

## Antes de publicar para valer

- WhatsApp do Instituto: (11) 93907-6655, o mesmo para as duas unidades. Para trocar, procure por `5511939076655` em `index.html`, `orcamento/index.html` e `painel/index.html`.
- Definir o benefício real do programa de indicação (hoje o texto diz "um cuidado especial" e "condições na recepção").

## Estrutura

```
index.html            site
indique/index.html    convite de indicação
orcamento/index.html  orçamento da paciente
painel/index.html     painel do Instituto
painel/vendor/        envio de vídeos grandes (Vercel Blob)
api/leads.js          contatos e agendamentos
api/budgets.js        orçamentos
api/refs.js           indicações
api/cases.js          antes & depois (desligado no painel; o site não usa)
api/media.js, upload.js  envio de arquivos
api/_lib.js           banco (Upstash Redis), armazenamento (Blob) e segurança
```
