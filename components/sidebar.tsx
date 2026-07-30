import Link from "next/link";
const links=[["/dashboard","Visão geral"],["/documents/new","Novo documento"],["/customers","Clientes"],["/suppliers","Fornecedores"],["/catalog","Produtos e serviços"],["/conversations","Conversas"],["/settings","Configurações"]];
export function Sidebar(){return <aside className="sidebar"><div className="brand">ember.</div><nav>{links.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</nav></aside>}
