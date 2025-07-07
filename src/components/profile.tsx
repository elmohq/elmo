'use client';
import { useUser } from "@auth0/nextjs-auth0"
import { SidebarInset, SidebarProvider } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { SectionCards } from "./section-cards";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

export default function Profile() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (!user) {
    return <a href="/auth/login">Login</a>;
  }

  if (user) {
    return  <SidebarProvider
    className="flex"
    style={
      {
        "--sidebar-width": "calc(var(--spacing) * 64)",
        "--header-height": "calc(var(--spacing) * 12 + 1px)",
      } as React.CSSProperties
    }
  >
    <AppSidebar variant="sidebar" />
    <SidebarInset>
      <SiteHeader />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards />

        {WHITE_LABEL_CONFIG.name}
            <div style={{ textAlign: "center" }}>
          <img
            src={user.picture}
            alt="Profile"
            style={{ borderRadius: "50%", width: "80px", height: "80px" }}
          />
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <pre>{JSON.stringify(user, null, 2)}</pre>
          <p><a href="/auth/logout">Logout</a></p>
        </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>;
  }
}
