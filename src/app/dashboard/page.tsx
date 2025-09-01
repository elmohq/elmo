import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAppConfig } from '@/lib/adapters';

export default async function DashboardPage() {
  const { adapters, features } = getAppConfig();
  const user = await adapters.auth.getCurrentUser();

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {features.auth && (
          <Button onClick={() => adapters.auth.signOut()}>Sign Out</Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Hello, {user?.name || 'Guest'}!</p>
          </CardContent>
        </Card>

        {features.billing && (
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Manage your subscription</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <p>View your analytics</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}