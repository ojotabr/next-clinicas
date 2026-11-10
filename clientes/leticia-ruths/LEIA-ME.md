# Leticia Ruths Odontologia: protótipo OdontoLink

## Endereços

| Endereço | O que é | Quem acessa |
|---|---|---|
| `/` | Site completo | Pacientes |
| `/agendar` | Página de agendamento (para clientes sem site) | Pacientes |
| `/i/codigo` | Convite de indicação personalizado ("Fulana indicou você") | Quem recebe o link |
| `/orcamento/?id=…` | Orçamento do paciente, com vídeo e aprovação | Só quem recebe o link |
| `/painel` | Painel da clínica | Dra. Leticia, com senha |

## O que já está ligado

- **Agendamento:** pelo site ou por `/agendar`, cai na Agenda e no Funil do painel. A clínica confirma o horário e a mensagem do WhatsApp sai pronta.
- **Avaliação do sorriso online:** cai no Funil com as respostas e a foto, se o paciente enviar.
- **Orçamento:** criado no painel com vídeo gravado na hora ou enviado de um arquivo. O paciente abre o link, assiste, escolhe a opção e aprova. O painel mostra quem abriu e quem aprovou.
- **Antes & depois:** cadastrado no painel, aparece sozinho no site.
- **Indicações:** na seção "Indique um sorriso", o paciente coloca nome e WhatsApp e recebe um link pessoal (`/i/codigo`) para copiar ou mandar pelo WhatsApp. Quem abre vê um convite com o nome de quem indicou. Se agendar ou fizer a avaliação online em até 60 dias, o contato chega no Funil marcado como indicação. A tela Indicações do painel mostra cliques, indicados, agendados e pacientes por pessoa, com botão para agradecer e marcar o mimo como entregue.
- **Exemplos:** Reativação, Avaliações e Automações ainda mostram dados de exemplo. Elas dependem da integração com o WhatsApp Business, que é a próxima fase.

## Configuração na Vercel

Já feito: Blob (fotos e vídeos) e a variável `PAINEL_SENHA`.

**Falta só o banco de dados (gratuito):**

1. No projeto, abra **Storage → Create Database** e escolha **Upstash** (Redis).
2. Escolha o plano **Free** e a região mais próxima (Washington, por exemplo).
3. Clique em **Create** e conecte ao projeto `leticia-ruths-odontologia`.
4. Em **Environment Variables**, confira se apareceram `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`).
5. Arraste este zip na página do projeto (Overview) para publicar a versão nova.

## Teste rápido

1. Abra o site, clique em **Agendar avaliação** e preencha.
2. Abra `/painel`, entre com a senha e vá em **Agenda**. O pedido deve estar lá.
3. Clique em **Confirmar e avisar** para abrir o WhatsApp com a mensagem pronta.
4. No **Funil**, abra o contato e clique em **Criar orçamento**. Grave o vídeo, preencha os valores e crie.
5. Abra o link do orçamento no celular e aprove. No painel, o status muda para **Aprovado**.

Observação: casos de antes & depois cadastrados antes desta versão precisam ser cadastrados de novo.

## Estrutura da pasta

```
index.html            site
agendar/index.html    página de agendamento independente
orcamento/index.html  página do orçamento do paciente
painel/index.html     painel da clínica
painel/vendor/        envio de vídeos grandes (Vercel Blob)
img/                  fotos e logo
api/leads.js          contatos e agendamentos
api/budgets.js        orçamentos
api/cases.js          antes & depois
api/media.js          envio de arquivos pequenos
api/upload.js         envio de vídeos grandes
api/_lib.js           banco (Upstash Redis), armazenamento (Blob) e segurança
```
