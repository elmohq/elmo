import { getAppConfig } from '@/lib/adapters';

export async function GET() {
  const { adapters } = getAppConfig();
  
  try {
    const user = await adapters.auth.getCurrentUser();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({ user });
  } catch (error) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}