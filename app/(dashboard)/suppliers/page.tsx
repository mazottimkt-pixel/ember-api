import { redirect } from "next/navigation";
export default function SuppliersRedirect() { redirect("/contacts?role=supplier"); }
