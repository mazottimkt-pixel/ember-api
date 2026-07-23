# Segurança para lançamento

O painel valida a sessão com `supabase.auth.getUser()` em cada página e novamente em cada Server Action. A API pública usa apenas a chave anônima e retorna uma lista explícita de campos.

Antes da publicação, confirme no Supabase que a tabela `public.websites` está com Row Level Security (RLS) habilitado e que:

- `anon` possui somente `SELECT`, necessário para a extensão;
- `authenticated` possui `SELECT`, `INSERT`, `UPDATE` e `DELETE`;
- não existe cadastro público de usuários administrativos;
- a chave `service_role` não está presente em variáveis `NEXT_PUBLIC_*` nem na extensão.

As variáveis esperadas pela aplicação são `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A chave anônima pode estar no cliente; a segurança dos dados depende das políticas RLS.

## Premissa de autorização administrativa

O painel e todas as mutações administrativas exigem uma sessão válida do Supabase. Nesta versão, qualquer usuário com o papel `authenticated` é considerado administrador; não há um sistema adicional de roles na aplicação.

Por isso, o lançamento só é seguro enquanto estas três condições forem mantidas no Supabase:

- o cadastro público de usuários estiver desativado;
- o login anônimo estiver desativado;
- somente contas de administradores forem criadas ou convidadas.

Se futuramente existirem usuários comuns autenticados, será obrigatório implementar autorização administrativa específica antes de conceder acesso a eles. As policies RLS atuais não devem ser ampliadas para `anon` além da leitura pública necessária para a extensão.
