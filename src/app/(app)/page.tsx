import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { VoiceHero } from "@/components/cortana/voice-hero";

export default async function HomePage() {
  const user = await requireUser();
  return (
    <Suspense>
      <VoiceHero firstName={user.name.split(" ")[0]} />
    </Suspense>
  );
}
