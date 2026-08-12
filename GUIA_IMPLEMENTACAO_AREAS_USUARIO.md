# Guia de implementação segura — Áreas de Sócio e Parceiro

Este guia acompanha a atualização do Clube de Vantagens Grupo EG News. A alteração foi preparada para **preservar os registros já existentes** nas tabelas de sócios, parceiros e interessados. O arquivo de migração apenas acrescenta colunas, tabelas, índices, funções e regras de acesso; ele não contém comandos para apagar dados.

> **Importante:** execute a migração primeiro no Supabase e publique o novo `index.html` somente depois de concluir a identificação da conta administrativa. Isso evita que o painel administrativo fique inacessível por falta de perfil de administrador.

## Arquivos desta atualização

| Arquivo | Finalidade |
|---|---|
| `index.html` | Interface pública, cadastro com conta individual, Home do Sócio, Home do Parceiro, login e painel administrativo atualizado. |
| `migration-areas-de-usuario.sql` | Migração aditiva do Supabase, com perfis, status, políticas de acesso e funções de aprovação/recusa. |
| `QA_VALIDATION.md` | Registro das rotas validadas localmente antes da publicação. |

## 1. Preparar uma cópia de segurança

No painel do Supabase, exporte ou registre uma cópia das tabelas `members`, `partners` e `partner_leads` antes de executar qualquer SQL. A migração não foi feita para apagar registros, mas o backup é uma proteção adicional para qualquer alteração de banco de dados.

Também confirme que o `index.html` contém a **URL do projeto Supabase** e a **chave pública (publishable/anon)** do mesmo projeto. Nunca use ou publique uma chave `service_role` no GitHub Pages.

## 2. Executar a migração

Abra o **SQL Editor** no projeto Supabase usado pelo Cartão de Vantagens. Crie uma nova consulta, copie todo o conteúdo de `migration-areas-de-usuario.sql`, execute-o e confirme que a operação foi concluída sem erros.

A migração cria os seguintes recursos:

| Recurso | Efeito prático |
|---|---|
| `user_profiles` | Distingue administradores, sócios e parceiros. |
| Campos `auth_user_id` e `email` | Vinculam o cadastro de cada pessoa a uma conta de acesso individual. |
| Campo `status` em interessados | Mantém o cadastro como `PENDENTE`, `ATIVO` ou `NEGADA`. |
| Campo `status` em parceiros | Define quais empresas aparecem como benefícios para os sócios. |
| `partner_change_requests` | Guarda sugestões de atualização enviadas pelos parceiros. |
| Regras de acesso | Impedem que sócios e parceiros consultem registros de outras pessoas. |
| Funções de aprovação e recusa | Atualizam o status sem excluir o interessado. |

## 3. Marcar a conta administrativa existente

Depois de executar a migração, rode esta consulta separadamente no SQL Editor. Substitua o e-mail pelo mesmo e-mail utilizado hoje para entrar no painel administrativo.

```sql
insert into public.user_profiles (id, email, account_type)
select id, email, 'admin'
from auth.users
where email = 'SEU_EMAIL_DE_ADMIN@EXEMPLO.COM'
on conflict (id) do update
set account_type = 'admin',
    email = excluded.email,
    updated_at = now();
```

A consulta não cria uma nova senha e não altera os dados já cadastrados. Ela apenas classifica a conta existente como administradora para que o painel continue funcionando depois da atualização de segurança.

## 4. Fluxos entregues

| Pessoa | Entrada | Resultado |
|---|---|---|
| Visitante | `#home` | Vê a apresentação do Clube de Vantagens e os dois atalhos públicos. |
| Novo sócio | `#cadastro-socio` | Cria conta com e-mail e senha e é direcionado para `#socio`; se a confirmação de e-mail estiver ativa, confirma o e-mail antes de entrar. |
| Sócio cadastrado | `#entrar-socio` | Acessa cartão virtual e benefícios das empresas com parceria ativa. |
| Novo parceiro | `#seja-parceiro` | Cria conta com e-mail e senha e é direcionado para `#parceiro`, inicialmente com status `PENDENTE`. |
| Parceiro cadastrado | `#entrar-parceiro` | Visualiza status, perfil enviado, benefício aprovado e envia solicitações de atualização. |
| Administrador | `#admin` | Aprova ou nega interessados e analisa solicitações de parceiros. |

Quando um interessado é aprovado, a administração informa o benefício oferecido. O sistema mantém o registro do interessado com status **ATIVO**, cria ou atualiza o parceiro visível para os sócios e vincula esse parceiro à conta da empresa. Quando uma parceria é negada, o registro é preservado com status **NEGADA**.

## 5. Teste recomendado antes de divulgar

Use dois e-mails de teste que ainda não existam no Supabase: um para sócio e outro para parceiro. Teste o cadastro, o login, a proteção das rotas privadas e a transição de status no painel administrativo.

| Teste | Resultado esperado |
|---|---|
| Cadastrar sócio de teste | Conta criada; usuário entra em `#socio`; benefícios ativos aparecem sem expor status interno. |
| Cadastrar parceiro de teste | Conta criada; usuário entra em `#parceiro` com status `PENDENTE`. |
| Aprovar parceiro no painel | Status do parceiro muda para `ATIVO`; benefício passa a aparecer para sócios. |
| Negar parceiro de teste | Status muda para `NEGADA`; registro não é apagado. |
| Enviar solicitação como parceiro | Item aparece na aba `solicitações` do painel administrativo. |
| Abrir `#socio` ou `#parceiro` sem login | Sistema encaminha para a tela de login apropriada. |

## 6. Publicação no GitHub Pages

Somente após os testes acima, envie os arquivos atualizados ao repositório do **Cartão de Vantagens**, sem alterar o repositório do Portal EG News. O fluxo é:

```text
executar migração no Supabase
        ↓
marcar conta administrativa
        ↓
testar sócio, parceiro e painel
        ↓
publicar index.html e os arquivos de apoio no repositório Cartão de Vantagens
        ↓
validar o GitHub Pages
```

A publicação no GitHub Pages altera a interface, mas não exclui registros no Supabase. O banco já estará preparado pela migração executada anteriormente.
