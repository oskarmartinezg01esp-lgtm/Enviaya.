import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** Claves de memoria conocidas y su descripción legible. */
export const PREFERENCE_LABELS: Record<string, string> = {
  preferredDrink: "Bebida favorita",
  preferredFood: "Comida favorita",
  dislikes: "No le gusta",
  diet: "Dieta",
  allergies: "Alergias",
  usualAddress: "Dirección habitual",
  spiceLevel: "Nivel de picante",
  notes: "Otras notas",
};

export async function isMemoryEnabled(userId: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  return profile?.memoryEnabled ?? true;
}

export async function getPreferences(userId: string) {
  return db.preference.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

export async function getPreferenceMap(userId: string): Promise<Record<string, string>> {
  if (!(await isMemoryEnabled(userId))) return {};
  const prefs = await getPreferences(userId);
  return Object.fromEntries(prefs.map((p) => [p.key, p.value]));
}

export async function setPreference(userId: string, key: string, value: string, source = "conversation") {
  if (!(await isMemoryEnabled(userId))) {
    throw new AppError("FORBIDDEN", "La memoria de CORTANA está desactivada en tu perfil.");
  }
  const k = key.trim().slice(0, 40);
  const v = value.trim().slice(0, 200);
  if (!k || !v) throw new AppError("VALIDATION", "Preferencia vacía.");
  return db.preference.upsert({
    where: { userId_key: { userId, key: k } },
    update: { value: v, source },
    create: { userId, key: k, value: v, source },
  });
}

export async function deletePreference(userId: string, id: string) {
  await db.preference.deleteMany({ where: { id, userId } });
}

export async function clearPreferences(userId: string) {
  await db.preference.deleteMany({ where: { userId } });
}
