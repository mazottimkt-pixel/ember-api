# Ember API

Aplicação administrativa e API pública do Produto #001 (HighStakes), construída com Next.js App Router, TypeScript, Tailwind CSS e Supabase.

## Funcionalidades

- autenticação administrativa com Supabase Auth;
- painel protegido em `/admin`;
- criação, edição e exclusão confirmada de ativos digitais;
- bloqueio de domínios duplicados;
- busca por domínio, proprietário ou país;
- filtros por status e categoria;
- API pública por domínio em `/api/websites/[domain]`;
- integração com a extensão Chrome Ember.

## Arquitetura

- `app/admin`: páginas administrativas, estados de carregamento/erro e Server Actions;
- `app/api/websites/[domain]`: Route Handler público consumido pela extensão;
- `lib/supabase-server.ts`: cliente Supabase para Server Components e Server Actions;
- `lib/supabase-browser.ts`: cliente Supabase para autenticação no navegador;
- `lib/websites.ts`: tipos, normalização e validação dos ativos.

As páginas e mutações administrativas validam a sessão no servidor. A API pública utiliza a chave anônima e depende das policies RLS do Supabase.

## Requisitos

- Node.js compatível com Next.js 16;
- projeto Supabase com Auth e tabela `public.websites`;
- policies RLS descritas em [SECURITY.md](./SECURITY.md).

## Variáveis de ambiente

Crie um arquivo `.env.local` com:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Não utilize a chave `service_role` em variáveis `NEXT_PUBLIC_*`.

## Desenvolvimento

```bash
npm install
npm run dev
```

A aplicação local fica disponível em `http://localhost:3000`.

## Validação

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Produção

- aplicação: `https://ember-api-lemon.vercel.app`;
- API: `https://ember-api-lemon.vercel.app/api/websites/{domain}`.

O deploy é realizado no Vercel. As duas variáveis de ambiente devem estar configuradas no ambiente de produção.

## Segurança

Consulte [SECURITY.md](./SECURITY.md) antes de criar usuários ou alterar policies. A versão atual considera todo usuário `authenticated` um administrador, portanto cadastro público e login anônimo devem permanecer desativados.

## Release

Consulte [RELEASE_NOTES_v1.0.1.md](./RELEASE_NOTES_v1.0.1.md) para o escopo e as limitações da versão atual.
