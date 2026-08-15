import { Sidebar } from "@/components/sidebar";
import { LumeCentral } from "@/components/lume-central";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">{children}</main>
      <LumeCentral />
    </div>
  );
}
