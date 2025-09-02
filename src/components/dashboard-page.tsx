'use client';

import { getAppConfig } from '@/lib/adapters';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const config = getAppConfig();

export function DashboardPage() {
  const { user, isLoaded } = config.providers.auth.useAuth();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your {config.features.auth ? 'Elmo Cloud' : 'Elmo OSS'} dashboard
          </p>
        </div>
        
        {config.features.auth && config.providers.auth.UserButton && (
          <config.providers.auth.UserButton />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {user?.name || 'User'}!</CardTitle>
            <CardDescription>
              {config.features.auth ? 'Cloud Version' : 'Open Source Version'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Email: {user?.email || 'demo@example.com'}
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
                <span className={`w-2 h-2 rounded-full ${config.features.auth ? 'bg-green-500' : 'bg-gray-300'}`} />
                Authentication
              </li>
              <li className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${config.features.billing ? 'bg-green-500' : 'bg-gray-300'}`} />
                Billing
              </li>
              <li className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${config.features.organizations ? 'bg-green-500' : 'bg-gray-300'}`} />
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
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/status">View Status</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start">
              Settings
            </Button>
            {config.features.billing && (
              <Button variant="outline" className="w-full justify-start">
                Billing
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
