import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthBackdrop } from "@/components/layout/auth-backdrop";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <AuthBackdrop />
      <div className="relative z-10 flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
