# Acesso administrativo pelo Vercel

O painel em `/#admin` usa a variável de ambiente **`ADMIN_PASSWORD`** configurada no projeto Vercel. A senha não é incluída no `index.html`, no GitHub ou no Supabase.

## Como trocar a senha

1. Abra o projeto **clube_vantagens_vercel** no Vercel.
2. Acesse **Settings → Environment Variables**.
3. Localize **`ADMIN_PASSWORD`** e escolha a opção de editar.
4. Informe a nova senha e mantenha os ambientes **Production** e **Preview** selecionados.
5. Salve a alteração e clique em **Redeploy** na notificação exibida pelo Vercel, ou crie uma nova implantação da branch `main`.
6. Abra `https://clubevantagensvercel.vercel.app/#admin` e entre usando a nova senha.

> Uma alteração de variável no Vercel só entra em vigor em novas implantações. A senha antiga permanece válida na implantação anterior até o redeploy terminar.

## Variáveis necessárias

| Variável | Finalidade | Pode ficar no GitHub? |
|---|---|---|
| `ADMIN_PASSWORD` | Valida a senha do painel administrativo. | Não. |
| `SUPABASE_URL` | Endereço do projeto Supabase usado pela API administrativa. | Não é segredo, mas foi mantida no Vercel para centralizar a configuração. |
| `SUPABASE_SERVICE_ROLE_KEY` | Permite que a API administrativa do Vercel execute as operações administrativas no Supabase. | Nunca. |

A rota `api/admin-login.js` cria uma sessão HTTP protegida após validar `ADMIN_PASSWORD`. A rota `api/admin-data.js` aceita operações somente com essa sessão e usa a chave de serviço apenas no servidor do Vercel. Sócios e parceiros continuam utilizando o Supabase Auth nas respectivas áreas privadas.
