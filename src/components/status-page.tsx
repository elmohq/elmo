'use client';

import { useState, useEffect } from 'react';
import { getAppConfig } from '@/lib/adapters';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const config = getAppConfig();

interface StatusData {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
  features: {
    auth: boolean;
    billing: boolean;
    organizations: boolean;
  };
  user?: {
    id: string;
    name: string;
    email?: string;
  };
}

export function StatusPage() {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isLoaded } = config.providers.auth.useAuth();

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/status');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setStatusData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      fetchStatus();
    }
  }, [isLoaded]);

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
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground">
            Monitor the health and status of your {config.features.auth ? 'Elmo Cloud' : 'Elmo OSS'} instance
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={fetchStatus} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          {config.features.auth && config.providers.auth.UserButton && (
            <config.providers.auth.UserButton />
          )}
        </div>
      </div>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
            {error.includes('Authentication required') && (
              <p className="text-sm text-red-500 mt-2">
                Please sign in to view system status.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Overall Status</CardTitle>
            <CardDescription>System health check</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ) : statusData ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span 
                    className={`w-3 h-3 rounded-full ${
                      statusData.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                    }`} 
                  />
                  <span className="font-medium capitalize">{statusData.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date(statusData.timestamp).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Unable to fetch status</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Info</CardTitle>
            <CardDescription>Version and environment details</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ) : statusData ? (
              <div className="space-y-2 text-sm">
                <div>Version: {statusData.version}</div>
                <div>Environment: {statusData.environment}</div>
                <div>Type: {config.features.auth ? 'Cloud' : 'OSS'}</div>
              </div>
            ) : (
              <p className="text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current User</CardTitle>
            <CardDescription>Authenticated user information</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            ) : user ? (
              <div className="space-y-2 text-sm">
                <div>Name: {user.name}</div>
                <div>Email: {user.email}</div>
                <div>ID: {user.id}</div>
              </div>
            ) : (
              <p className="text-muted-foreground">No user authenticated</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>Available features in this deployment</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse">
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-gray-200 rounded"></div>
                  ))}
                </div>
              </div>
            ) : statusData ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <span className={`w-3 h-3 rounded-full ${statusData.features.auth ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <div className="font-medium">Authentication</div>
                    <div className="text-sm text-muted-foreground">
                      {statusData.features.auth ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <span className={`w-3 h-3 rounded-full ${statusData.features.billing ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <div className="font-medium">Billing</div>
                    <div className="text-sm text-muted-foreground">
                      {statusData.features.billing ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <span className={`w-3 h-3 rounded-full ${statusData.features.organizations ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <div className="font-medium">Organizations</div>
                    <div className="text-sm text-muted-foreground">
                      {statusData.features.organizations ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No feature data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
