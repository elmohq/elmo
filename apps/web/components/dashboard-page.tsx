"use client";

import Link from "next/link";
import { Button } from "@elmo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@elmo/ui/components/card";
import { getAppConfig } from "@/lib/adapters";

const config = getAppConfig();

export function DashboardPage() {
  const { user, isLoaded } = config.providers.auth.useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-gray-900 border-b-2" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your {config.features.auth ? "Elmo Cloud" : "Elmo OSS"}{" "}
            dashboard
          </p>
        </div>

        {config.features.auth && config.providers.auth.UserButton && (
          <config.providers.auth.UserButton />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {user?.name || "User"}!</CardTitle>
            <CardDescription>
              {config.features.auth ? "Cloud Version" : "Open Source Version"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Email: {user?.email || "demo@example.com"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>Available in this version</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${config.features.auth ? "bg-green-500" : "bg-gray-300"}`}
                />
                Authentication
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${config.features.billing ? "bg-green-500" : "bg-gray-300"}`}
                />
                Billing
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${config.features.organizations ? "bg-green-500" : "bg-gray-300"}`}
                />
                Organizations
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/status">View Status</Link>
            </Button>
            <Button className="w-full justify-start" variant="outline">
              Settings
            </Button>
            {config.features.billing && (
              <Button className="w-full justify-start" variant="outline">
                Billing
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
