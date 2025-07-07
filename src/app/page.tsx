import { db } from "@/lib/db/db";
import Profile from "@/components/profile";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

export default async function Home() {

  const result = await db.execute('select 1');

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        {WHITE_LABEL_CONFIG.name}
        <Profile />
      </main>
    </div>
  );
}
