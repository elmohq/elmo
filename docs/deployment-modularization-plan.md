# Deployment Modularization Plan

This document outlines a plan to modularize the elmo codebase to support multiple deployment paradigms:

1. **White-label** (current) - Auth0-based authentication, branded for whitelabel-client
2. **Docker Compose** - Self-contained local deployment, no auth required, full read/write
3. **Cloud (non-whitelabel)** - Clerk authentication, multi-tenant SaaS
4. **Demo** - Read-only public instance, no auth required, all writes blocked

---

## Current Architecture Analysis

### Dependencies & Services
- **Authentication**: Auth0 (`@auth0/nextjs-auth0`, `auth0` Management API)
- **Database**: PostgreSQL with Drizzle ORM
- **Analytics**: Tinybird, ClickHouse
- **Caching**: Upstash Redis
- **Job Queue**: BullMQ
- **AI Providers**: OpenAI, Anthropic

### Key Files Requiring Abstraction
| File | Purpose | Current Coupling |
|------|---------|------------------|
| `src/lib/auth0.ts` | Auth client | Hardcoded Auth0 |
| `src/lib/metadata.ts` | User/org data from Auth0 | Auth0 Management API |
| `src/lib/white-label.ts` | Branding config | Hardcoded values |
| `src/lib/redis.ts` | Cache client | Upstash Redis |
| `src/lib/db/db.ts` | Database connection | Direct env var |
| `src/lib/tinybird*.ts` | Analytics queries | Tinybird API |

### Services Notes
- **Redis**: Use Upstash client (`@upstash/redis`) everywhere. For Docker, use `serverless-redis-http` proxy to expose standard Redis with Upstash-compatible HTTP API.
- **Analytics**: Currently using ClickHouse client to read from Tinybird (for portability). Keep this pattern - we can point the ClickHouse client at different backends if needed.

---

## Proposed Architecture

### 1. Create a Configuration Layer

Create a central configuration system that determines deployment mode and loads appropriate settings.

```
packages/
  config/
    src/
      index.ts              # Main config exports
      types.ts              # TypeScript interfaces
      deployment-modes.ts   # Mode definitions
      loaders/
        env.ts              # Load from environment
        file.ts             # Load from config files
```

**Key configuration values:**
```typescript
interface DeploymentConfig {
  mode: 'whitelabel' | 'docker' | 'cloud' | 'demo';
  
  auth: {
    provider: 'auth0' | 'clerk' | 'none';
    // Provider-specific config loaded dynamically
  };
  
  features: {
    readOnly: boolean;      // For demo mode - blocks all non-GET requests
    multiTenant: boolean;   // Multiple orgs per user (cloud only)
    adminPanel: boolean;    // Enable admin routes
  };
  
  // For local provider (docker/demo) - the single org to use
  defaultOrganization?: {
    id: string;
    name: string;
  };
  
  branding: {
    name: string;
    icon: string;
    url: string;
    parentName?: string;
    parentUrl?: string;
    chartColors: string[];
  };
}
```

### 2. Abstract Authentication Layer

Create an auth abstraction that supports multiple providers.

```
packages/
  auth/
    src/
      index.ts
      types.ts
      providers/
        auth0.ts           # Current Auth0 implementation
        clerk.ts           # Clerk implementation  
        local.ts           # No auth - for docker/demo modes
      middleware.ts        # Unified middleware factory
```

**Auth Provider Interface:**
```typescript
interface AuthProvider {
  // Get current session/user
  getSession(): Promise<Session | null>;
  
  // Organization management
  organizations: {
    // List orgs the user has access to
    list(): Promise<Organization[]>;
    
    // Check if user can create new orgs
    canCreate(): boolean;
    
    // Create a new org (throws if not supported)
    create?(name: string): Promise<Organization>;
    
    // Check if user has access to a specific org
    hasAccess(orgId: string): Promise<boolean>;
  };
  
  // Check if user is admin
  isAdmin(): Promise<boolean>;
  
  // Middleware for route protection
  middleware(): NextMiddleware;
  
  // Login/logout handlers (no-op for local provider)
  handlers: {
    login: RouteHandler;
    logout: RouteHandler;
    callback: RouteHandler;
  };
}
```

**Organization Capabilities by Provider:**

| Provider | List Orgs | Create Orgs | Source |
|----------|-----------|-------------|--------|
| Local (Docker/Demo) | Single default org | No | Config/DB |
| Auth0 (White-label) | From `app_metadata.elmo_orgs` | No | Auth0 Management API |
| Clerk (Cloud) | From Clerk organizations | Yes | Clerk API |

**Local Auth Provider (for Docker & Demo):**
```typescript
// packages/auth/src/providers/local.ts

// Single default organization, no creation
class LocalAuthProvider implements AuthProvider {
  async getSession() {
    return { user: { id: 'local-user', name: 'Local User' } };
  }
  
  organizations = {
    async list() {
      // Return single default org (from config or first brand in DB)
      const defaultOrg = getConfig().defaultOrganization;
      if (defaultOrg) {
        return [defaultOrg];
      }
      // Fallback: return first brand from database
      const brands = await getAllBrandsFromDb();
      return brands.slice(0, 1);
    },
    
    canCreate() {
      return false; // Cannot create orgs in local mode
    },
    
    async hasAccess(orgId: string) {
      const orgs = await this.list();
      return orgs.some(o => o.id === orgId);
    }
  };
  
  async isAdmin() {
    return true; // Admin access in local mode
  }
}
```

**Auth0 Provider (White-label):**
```typescript
// packages/auth/src/providers/auth0.ts

// Read orgs from Auth0 metadata, no creation
class Auth0Provider implements AuthProvider {
  organizations = {
    async list() {
      // Current implementation: fetch from Auth0 app_metadata.elmo_orgs
      const appMetadata = await getAppMetadata();
      return appMetadata.elmo_orgs || [];
    },
    
    canCreate() {
      return false; // Orgs managed externally in Auth0
    },
    
    async hasAccess(orgId: string) {
      const orgs = await this.list();
      return orgs.some(o => o.id === orgId);
    }
  };
}
```

**Clerk Provider (Cloud):**
```typescript
// packages/auth/src/providers/clerk.ts

// Full org management via Clerk
class ClerkProvider implements AuthProvider {
  organizations = {
    async list() {
      // Use Clerk's organization membership API
      const { orgList } = await clerkClient.users.getOrganizationMembershipList({
        userId: currentUserId
      });
      return orgList.map(membership => ({
        id: membership.organization.id,
        name: membership.organization.name,
      }));
    },
    
    canCreate() {
      return true; // Users can create orgs in cloud mode
    },
    
    async create(name: string) {
      const org = await clerkClient.organizations.createOrganization({
        name,
        createdBy: currentUserId,
      });
      return { id: org.id, name: org.name };
    },
    
    async hasAccess(orgId: string) {
      const orgs = await this.list();
      return orgs.some(o => o.id === orgId);
    }
  };
}
```

### 3. Demo Mode: Middleware-Level Write Blocking

Instead of wrapping individual API routes, block all non-GET requests at the middleware level. This ensures all current and future write operations are automatically blocked.

```typescript
// apps/web/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getConfig } from '@workspace/config';

export function middleware(request: NextRequest) {
  const config = getConfig();
  
  // Demo mode: Block all non-GET requests to API routes
  if (config.features.readOnly) {
    const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    
    if (isApiRoute && isWriteMethod) {
      return NextResponse.json(
        { 
          error: 'Demo Mode', 
          message: 'Write operations are disabled in demo mode' 
        },
        { status: 403 }
      );
    }
  }
  
  // Continue with auth middleware for authenticated modes
  if (config.auth.provider !== 'none') {
    return authMiddleware(request);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/app/:path*',
  ],
};
```

**Benefits of middleware-level blocking:**
- Zero changes to existing API routes
- All future routes automatically protected
- Single point of enforcement
- Easy to audit and test

---

## Implementation Plan

### Phase 1: Configuration Foundation

1. **Create `packages/config` package**
   - Define TypeScript interfaces for all config types
   - Create environment variable loader
   - Export unified `getConfig()` function

2. **Define deployment mode presets**
   ```typescript
   const PRESETS = {
     whitelabel: {
       auth: { provider: 'auth0' },
       features: { readOnly: false, multiTenant: false, adminPanel: true },
       // Orgs: read from Auth0 metadata, cannot create
     },
     docker: {
       auth: { provider: 'none' },
       features: { readOnly: false, multiTenant: false, adminPanel: true },
       // Orgs: single default org from config, cannot create
     },
     cloud: {
       auth: { provider: 'clerk' },
       features: { readOnly: false, multiTenant: true, adminPanel: true },
       // Orgs: full CRUD via Clerk, can create/switch
     },
     demo: {
       auth: { provider: 'none' },
       features: { readOnly: true, multiTenant: false, adminPanel: false },
       // Orgs: single default org from config, cannot create (readOnly anyway)
     }
   };
   ```
   
   **Organization Management Summary:**
   | Mode | List Orgs | Create Orgs | Switch Orgs | Source |
   |------|-----------|-------------|-------------|--------|
   | White-label | Yes | No | Yes (if multiple in metadata) | Auth0 `app_metadata` |
   | Docker | Single org only | No | No | Config env vars |
   | Cloud | Yes | Yes | Yes | Clerk API |
   | Demo | Single org only | No | No | Config env vars |

3. **Migrate `white-label.ts` to config package**
   - Make branding configurable via env vars
   - Support per-deployment branding

### Phase 2: Auth Abstraction

1. **Create `packages/auth` package**
   - Define `AuthProvider` interface
   - Implement Auth0 provider (extract from current code)
   - Implement Clerk provider
   - Implement Local provider (no auth - for docker/demo)

2. **Create unified middleware**
   ```typescript
   // apps/web/middleware.ts
   import { createMiddleware } from '@workspace/auth';
   import { getConfig } from '@workspace/config';
   
   export const middleware = createMiddleware(getConfig());
   ```

3. **Refactor `metadata.ts`**
   - Move org fetching logic to auth provider
   - Keep database operations in metadata.ts
   - Local provider returns all brands from DB

### Phase 3: API Route Audit

Before implementing demo mode blocking, audit all API routes to ensure proper HTTP method usage:

1. **Audit all GET routes for side effects**
   - Scan all `route.ts` files for GET handlers
   - Ensure no GET handler performs database writes, cache mutations, or triggers expensive operations
   - Document any violations found
   
2. **Review wizard endpoints specifically**
   Current wizard endpoints to audit:
   ```
   /api/wizard/analyze-website    - Does this trigger AI calls? Should be POST
   /api/wizard/create-prompts     - Creates data, should be POST
   /api/wizard/get-competitors    - If it fetches externally, consider POST
   /api/wizard/get-keywords       - If it fetches externally, consider POST
   /api/wizard/get-personas       - If it fetches externally, consider POST
   /api/wizard/skip-onboarding    - Modifies state, should be POST
   /api/admin/wizard/*            - Review each for side effects
   ```

3. **Convert violating GET routes to POST**
   - Any GET route that triggers expensive operations (AI calls, external API calls) → POST
   - Any GET route that modifies state → POST/PUT/PATCH/DELETE as appropriate
   - Update corresponding frontend code to use correct HTTP methods

4. **Create route audit checklist**
   ```
   [ ] GET /api/brands - read only ✓
   [ ] GET /api/brands/[id] - read only ✓
   [ ] GET /api/wizard/analyze-website - AUDIT NEEDED
   [ ] ... (full list in implementation)
   ```

### Phase 4: Demo Mode Middleware & UI

1. **Add read-only middleware check**
   - Block POST/PUT/PATCH/DELETE on `/api/*` routes
   - Return 403 with clear demo mode message
   - No changes to individual route handlers needed
   - **Relies on Phase 3 audit** - all writes must use non-GET methods

2. **Organization UI components**
   - Create `OrgSwitcher` component that respects auth provider capabilities
   - Show "Create Organization" only when `auth.organizations.canCreate()` returns true
   - Hide switcher entirely when only single org available
   
   ```typescript
   // Example OrgSwitcher logic
   const { organizations } = useAuth();
   const orgs = await organizations.list();
   const canCreate = organizations.canCreate();
   
   // If single org and can't create, don't show switcher
   if (orgs.length === 1 && !canCreate) {
     return null;
   }
   ```

3. **Demo mode UI**
   - Add "Demo Mode" banner when `readOnly: true`
   - Optionally hide/disable mutation buttons
   - Add call-to-action for full version

### Phase 5: Docker Compose Setup

1. **Create `docker/` directory**
   ```
   docker/
     Dockerfile
     docker-compose.yml        # Full local setup
     docker-compose.demo.yml   # Demo mode overlay
     init-scripts/
       init-db.sql             # Database schema + seed data
       seed-demo.sql           # Demo-specific sample data
   ```

2. **Services in docker-compose.yml:**
   - `web` - Next.js application
   - `worker` - Background job worker
   - `postgres` - PostgreSQL database
   - `redis` - Redis for caching/queues
   - `redis-http` - Upstash-compatible HTTP proxy for Redis
   - `clickhouse` - ClickHouse for analytics (optional, or connect to hosted)

3. **Demo mode overlay (docker-compose.demo.yml):**
   ```yaml
   services:
     web:
       environment:
         - DEPLOYMENT_MODE=demo
     worker:
       # Disable worker in demo mode
       profiles: ["disabled"]
   ```

### Phase 6: Seed Data & Demo Content

1. **Create seed scripts**
   - Sample brand with prompts
   - Pre-populated analytics data in Tinybird
   - Realistic-looking demo content

2. **Documentation**
   - README for Docker setup
   - Environment variable reference
   - Troubleshooting guide

---

## File Structure After Modularization

```
elmo/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── api/
│       │   │   │   ├── wizard/      # AUDIT: ensure expensive ops use POST
│       │   │   │   └── ...          # (unchanged - middleware handles demo blocking)
│       │   │   └── ...
│       │   ├── lib/
│       │   │   ├── db/              # Keep as-is (Drizzle)
│       │   │   ├── redis.ts         # Keep as-is (Upstash client, works with redis-http proxy)
│       │   │   ├── clickhouse.ts    # Keep as-is (ClickHouse client, points to Tinybird or standalone)
│       │   │   └── ...              # Remove auth0.ts, metadata.ts uses auth package
│       │   └── middleware.ts        # Uses @workspace/auth + demo mode blocking
│       └── ...
├── packages/
│   ├── ui/                          # Keep as-is
│   ├── config/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       └── presets.ts
│   └── auth/
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── middleware.ts
│           └── providers/
│               ├── auth0.ts
│               ├── clerk.ts
│               └── local.ts         # No auth - docker & demo
└── docker/
    ├── Dockerfile
    ├── docker-compose.yml           # Local dev (full read/write)
    ├── docker-compose.demo.yml      # Demo mode overlay (read-only)
    └── init-scripts/
        ├── init-db.sql
        └── seed-demo.sql
```

---

## Environment Variables by Mode

### White-label (current)
```env
DEPLOYMENT_MODE=whitelabel

# Auth0
AUTH0_SECRET=...
AUTH0_BASE_URL=...
AUTH0_ISSUER_BASE_URL=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_MGMT_API_DOMAIN=...

# Services
DATABASE_URL=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Analytics (ClickHouse via Tinybird)
CLICKHOUSE_HOST=https://api.tinybird.co  # Tinybird's ClickHouse endpoint
CLICKHOUSE_DATABASE=...
TINYBIRD_TOKEN=...  # Used for auth with Tinybird's ClickHouse

# Branding (optional overrides)
BRAND_NAME="WHITELABEL-CLIENT AI Search"
BRAND_ICON="/brands/whitelabel-client/icon.png"
```

### Docker Compose (local dev)
```env
DEPLOYMENT_MODE=docker

# No auth config needed - local provider gives full access

# Default organization (single org for local mode)
DEFAULT_ORG_ID=local-org
DEFAULT_ORG_NAME="Local Organization"

# Services (internal docker network)
DATABASE_URL=postgres://postgres:password@postgres:5432/elmo
UPSTASH_REDIS_REST_URL=http://redis-http:80
UPSTASH_REDIS_REST_TOKEN=local-token

# Analytics (ClickHouse - can point to local or hosted)
CLICKHOUSE_HOST=http://clickhouse:8123
CLICKHOUSE_DATABASE=elmo
# Or connect to Tinybird's ClickHouse endpoint if preferred

# Branding
BRAND_NAME="Elmo AI (Local)"
BRAND_ICON="/icon.png"
```

### Cloud (Clerk)
```env
DEPLOYMENT_MODE=cloud

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...

# Services
DATABASE_URL=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Analytics (ClickHouse via Tinybird or direct)
CLICKHOUSE_HOST=...
CLICKHOUSE_DATABASE=...
TINYBIRD_TOKEN=...  # If using Tinybird

# Branding
BRAND_NAME="Elmo AI"
BRAND_ICON="/icon.png"
```

### Demo
```env
DEPLOYMENT_MODE=demo

# No auth config needed - local provider, but readOnly=true blocks all writes

# Default organization (single org for demo mode)
DEFAULT_ORG_ID=demo-org
DEFAULT_ORG_NAME="Demo Organization"

# Services (same as docker, could be hosted)
DATABASE_URL=postgres://...
UPSTASH_REDIS_REST_URL=...
TINYBIRD_TOKEN=...
TINYBIRD_BASE_URL=...

# Branding
BRAND_NAME="Elmo AI Demo"
BRAND_ICON="/icon.png"
```

---

## Migration Path

### Step 1: Non-breaking additions
- Add new packages without modifying existing code
- Add feature flags to enable new code paths
- All new code behind `if (getConfig().mode === '...')` checks

### Step 2: Gradual migration
- Add auth providers one at a time (Local → Clerk → keep Auth0)
- Test each mode independently
- Middleware handles demo blocking with zero route changes

### Step 3: Remove old code
- Once all modes work, remove direct imports of auth0.ts
- Refactor metadata.ts to use auth provider
- Update documentation

---

## Testing Strategy

1. **Unit tests per provider**
   - Each auth provider tested independently
   - Config loading tested for all modes

2. **Integration tests per mode**
   - Spin up mode-specific environment
   - Run full API test suite
   - Verify demo mode rejects all POST/PUT/PATCH/DELETE

3. **Docker smoke tests**
   - `docker-compose up` should work out of box
   - Verify all services healthy (postgres, redis, tinybird-local)
   - Run basic E2E tests

4. **Demo mode verification**
   - Automated test that attempts write operations
   - All should return 403

---

## Open Questions / Decisions Needed

1. **Demo data strategy**: Should demo use a snapshot of real data, or fully synthetic data?

2. **Clerk organization model**: Does Clerk's organization feature map 1:1 to current Auth0 `elmo_orgs` metadata?

3. **Worker in demo mode**: Disable background jobs entirely? (Recommended: yes, via Docker Compose profiles)

4. **ClickHouse for Docker**: Use standalone ClickHouse container, or connect to hosted Tinybird even in Docker mode?

5. **Wizard endpoint HTTP methods**: Review which wizard endpoints should be POST vs GET:
   - `analyze-website` - triggers AI/external calls → likely POST
   - `get-competitors` - external API calls → consider POST
   - `get-keywords` - external API calls → consider POST
   - `get-personas` - AI calls → likely POST
   - Need to audit actual implementation to determine

---

## Note on Redis Setup

The codebase uses `@upstash/redis` (HTTP-based client) everywhere. For Docker deployments, use the `serverless-redis-http` proxy to expose standard Redis with an Upstash-compatible API:

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    
  redis-http:
    image: hiett/serverless-redis-http:latest
    environment:
      - SRH_MODE=env
      - SRH_TOKEN=local-token
      - SRH_CONNECTION_STRING=redis://redis:6379
    ports:
      - "8079:80"
    depends_on:
      - redis
```

**Environment variables for Docker:**
```env
UPSTASH_REDIS_REST_URL=http://redis-http:80
UPSTASH_REDIS_REST_TOKEN=local-token
```

This requires **zero code changes** - the existing `@upstash/redis` client works as-is.

---

## Estimated Scope

| Phase | Key Deliverables | Files Affected |
|-------|------------------|----------------|
| 1 | Config package, presets | ~6 new files |
| 2 | Auth package, providers | ~10 new files, ~3 modified |
| 3 | API route audit | ~0 new files, ~5-10 routes potentially modified |
| 4 | Demo mode middleware & UI | ~2 new files (middleware.ts, OrgSwitcher) |
| 5 | Docker Compose setup | ~6 new files |
| 6 | Seed data & demo content | ~3 new files |

**Total: ~27 new files, ~8-13 modified files**

Key simplifications:
- Same Redis client everywhere (Upstash `@upstash/redis` + HTTP proxy for Docker)
- Same analytics approach (ClickHouse client, can point to Tinybird or standalone)
- Middleware-level demo blocking (no per-route wrappers)

---

## Summary

This plan provides a clean separation of concerns:

- **Config** determines what mode we're in and feature flags
- **Auth** handles who the user is and what they can access (or bypasses auth entirely)
- **Middleware** blocks all writes in demo mode automatically

The key principles are:
1. **Reuse services**: Same Redis, Tinybird, Postgres everywhere
2. **Middleware-first**: Demo mode blocking requires zero route changes
3. **Convention over configuration**: Sensible defaults per mode
4. **Gradual migration**: Don't break existing functionality
