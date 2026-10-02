import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const GET = apiRoute(async () => {
  const user = await apiUser();
  return db.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
  });
});
