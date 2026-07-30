import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
const links = [
  ["/dashboard", "Visão geral"],
  ["/demo", "Demonstração"],
  ["/documents", "Documentos"],
  ["/documents/new", "Novo documento"],
  ["/contacts", "Cadastros"],
  ["/catalog", "Produtos e serviços"],
  ["/conversations", "Conversas"],
  ["/settings", "Configurações"],
];
export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">ember.</div>
      <nav aria-label="Navegação principal">
        {links.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <form action={logout}>
        <button className="logout">Sair</button>
      </form>
    </aside>
  );
}
