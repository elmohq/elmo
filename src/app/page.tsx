"use client";

import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@auth0/nextjs-auth0";
import { redirect } from "next/navigation";

export default function Home() {
  const { user, isLoading } = useUser();

	if (isLoading) {
		return <p>Loading...</p>;
	}

	if (!user) {
		return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="mx-auto">
          <CardContent className="flex flex-col items-center space-y-6 py-4 px-12">
            <div className="flex items-center space-x-3 pb-4">
              <img 
                src={WHITE_LABEL_CONFIG.icon} 
                alt="Logo" 
                className="!size-5" 
              />
              <span className="text-base font-semibold">
                {WHITE_LABEL_CONFIG.name}
              </span>
            </div>
            
            <Button asChild>
              <a href="/auth/login">
                Sign In
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
	} else {
    // redirect to /app
    redirect("/app");
  }
}
