# Ember HighStakes v1.0.1

## Funcionalidades

- autenticação de administradores com Supabase;
- painel administrativo protegido;
- criação, listagem, edição e exclusão de ativos;
- confirmação antes da exclusão;
- validação de formulário e bloqueio de domínio duplicado;
- busca e filtros no painel;
- estados de carregamento, envio, erro e registro não encontrado;
- API pública de consulta por domínio;
- extensão Chrome integrada à API de produção.

## Arquitetura resumida

O backend e o painel utilizam Next.js 16 com App Router, React 19, TypeScript e Tailwind CSS. Server Components carregam dados administrativos e Server Actions executam as mutações. O Supabase fornece autenticação, persistência e autorização por RLS.

A extensão utiliza Manifest V3, permissão `activeTab` e acesso restrito ao host de produção. O popup identifica o domínio da aba ativa e consulta o Route Handler `/api/websites/[domain]`.

## Correções realizadas

- conclusão do CRUD administrativo;
- policies RLS de `UPDATE` e `DELETE` validadas no Supabase;
- normalização e validação de domínios;
- tratamento separado para 404 e falhas de infraestrutura na edição;
- tratamento de erros HTTP e de rede na extensão;
- remoção da confirmação falsa de envio de proposta;
- botão de proposta mantido desabilitado, legível e identificado como “Em breve”;
- correção de responsividade básica e estados de carregamento;
- remoção de rota de teste, base estática legada e assets órfãos;
- documentação de segurança e lançamento atualizada;
- build de produção validado e publicado no Vercel.

## Limitações atuais

- todos os usuários `authenticated` são considerados administradores;
- cadastro público e login anônimo devem permanecer desativados;
- o botão de proposta não possui fluxo de envio e permanece desabilitado;
- busca e filtros são executados no navegador sobre a lista carregada;
- a API pública não possui rate limiting nesta versão;
- a tabela administrativa utiliza rolagem horizontal em telas pequenas.

## Próximos passos

- autorização administrativa por roles;
- fluxo persistente de propostas;
- paginação e filtros no servidor;
- rate limiting e observabilidade da API;
- headers adicionais de segurança;
- preparação da extensão para distribuição na Chrome Web Store.
