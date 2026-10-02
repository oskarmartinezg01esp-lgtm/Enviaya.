import { Suspense } from "react";
import { AuthForm } from "@/components/layout/auth-form";

export const metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />
    </Suspense>
  );
}
