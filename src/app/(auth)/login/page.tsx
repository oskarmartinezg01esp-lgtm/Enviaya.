import { Suspense } from "react";
import { AuthForm } from "@/components/layout/auth-form";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />
    </Suspense>
  );
}
