# Validação local — Áreas de Sócio e Parceiro

## Resultados validados no navegador

| Rota | Resultado |
|---|---|
| `#home` | A Home pública continua disponível com os atalhos para os dois cadastros. |
| `#entrar-socio` | Exibe a tela de login específica de sócio e o link para novo cadastro. |
| `#entrar-parceiro` | Exibe a tela de login específica de parceiro e o link para novo cadastro. |
| `#cadastro-socio` | Apresenta os campos de perfil, e-mail, senha e confirmação de senha. |
| `#socio`, sem sessão | Redireciona automaticamente para `#entrar-socio`, preservando a proteção da área privada. |
| `#parceiro`, sem sessão | Redireciona automaticamente para `#entrar-parceiro`, preservando a proteção da área privada. |

## Limite da validação atual

A validação de cadastro real, persistência no banco, aprovação, recusa, visualização de benefícios e carregamento de dados personalizados depende da execução prévia de `migration-areas-de-usuario.sql` no Supabase. Nenhum cadastro de teste foi enviado ao banco durante esta etapa, para preservar os dados do usuário.

## Migração no Supabase

A migração aditiva foi executada com sucesso no projeto **Cartão de vantagens** (branch de produção). O editor SQL confirmou **“Success. No rows returned”**. A execução não retornou erro e não usou comandos de exclusão de dados.

A conta administrativa informada pelo usuário foi vinculada ao perfil `admin` na tabela `user_profiles`, com confirmação de sucesso no SQL Editor do Supabase.
