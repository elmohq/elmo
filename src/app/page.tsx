import Profile from "@/components/profile";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

export default function Home() {
  return (
    <div className="w-full">
      <main className="w-full">
        <Profile />
      </main>
    </div>
  );
}
