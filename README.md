# Elmo

AI visibility monitoring for brands. Track how AI models represent your brand across different prompts and over time.

## Quick Start

For local deployments, use Docker Compose as configured with the `@elmohq/cli` package:

```bash
# Install the CLI globally
npm install -g @elmohq/cli

# Initialize configuration (interactive wizard)
elmo init

# Start the stack
elmo start
```

You may find these commands useful:

```bash
# Stop the stack
elmo stop

# View logs
elmo logs -f

# Run any docker compose command
elmo compose ps
elmo compose down
```

## Tech Stack

- **Language**: TypeScript 5.x
- **Framework**: Next.js 16.x (App Router with Turbopack)
- **Styling**: Tailwind CSS v4
- **Component Library**: shadcn/ui (new-york style)
- **Data Fetching**: SWR
- **Database**: Drizzle ORM with PostgreSQL
- **Analytics**: PostgreSQL with covering indices
- **Queue**: BullMQ with Redis
- **Testing**: Vitest
- **Linting & Formatting**: Biome
- **Package Manager**: pnpm (required)
- **Monorepo**: Turborepo

## Project Structure

```
.
├── apps/
│   ├── web/                    # Next.js application
│   │   ├── src/
│   │   │   ├── app/            # App Router pages and API routes
│   │   │   │   ├── api/        # API route handlers
│   │   │   │   └── app/        # Protected app pages
│   │   │   ├── components/     # Application-specific components
│   │   │   ├── hooks/          # Custom React hooks (use-*.tsx)
│   │   │   └── lib/            # Utilities, config, helpers
│   │   └── scripts/            # CLI scripts for maintenance tasks
│   ├── cli/                    # @elmohq/cli - Published npm package
│   └── worker/                 # Background job worker (BullMQ)
│
├── packages/
│   ├── ui/                     # Shared UI components (shadcn/ui)
│   │   └── src/
│   │       ├── components/     # Button, Card, Dialog, etc.
│   │       ├── hooks/          # UI hooks (use-mobile)
│   │       ├── lib/            # Utilities (cn)
│   │       └── styles/         # Global CSS variables
│   ├── lib/                    # Shared business logic
│   │   └── src/
│   │       ├── db/             # Drizzle schema and migrations
│   │       └── ai-providers.ts # AI SDK configuration
│   ├── config/                 # Type definitions for deployment
│   ├── deployment/             # Deployment mode resolution
│   ├── demo/                   # Demo mode implementation
│   ├── local/                  # Local development mode
│   └── whitelabel/             # Whitelabel deployment mode
│
├── biome.json                  # Linting and formatting config
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # Workspace definition
└── package.json                # Root package with scripts
```

## Getting Started

### Prerequisites

- Node.js 24.x
- pnpm 10.x+

### Installation

```bash
pnpm install
```

### Development

Run all development servers:

```bash
pnpm dev
```

Or run only the web app:

```bash
pnpm --filter @workspace/web dev
```

## Commands Reference

### Development

```bash
pnpm dev                              # Run all dev servers (turbo)
pnpm --filter @workspace/web dev      # Run only web app
```

### Building

```bash
pnpm build                            # Build all packages
pnpm --filter @workspace/web build    # Build only web app
```

### Testing

```bash
pnpm test                             # Run all tests
pnpm --filter @workspace/web test:watch  # Watch mode for web
```

### Component Stories (Ladle)

```bash
pnpm --filter @workspace/web ladle    # Start Ladle dev server
```

Stories live in `apps/web/src/stories/` and cover the app sidebar (across deployment modes) and prompt charts (including loading, error, and empty states). Ladle uses a separate Vite config (`.ladle/vite.config.ts`) with mocked hooks and routing so components render in isolation without a running backend.

### Code Quality

```bash
pnpm lint                             # Run Biome linter
pnpm format                           # Format with Biome
pnpm knip                             # Find unused exports/dependencies
```

### Database

```bash
cd apps/web
pnpm drizzle-kit generate             # Generate migrations
pnpm drizzle-kit migrate              # Run migrations
```

### Worker

```bash
pnpm --filter @workspace/worker dev   # Run worker in dev mode
```

### Versioning

```bash
pnpm changeset                        # Create a changeset
pnpm version-packages                 # Apply changesets and bump versions
```

### Code Style

Use `pnpm format` to apply Biome styles to the codebase.

## Deployment

### Deployment Modes

The app supports multiple deployment modes configured via `DEPLOYMENT_MODE`:

- **local**: Single-tenant, no auth required
- **demo**: Read-only demo mode
- **whitelabel**: Multi-tenant with Auth0
- **cloud**: Full SaaS mode (future)

Each mode has its own package in `packages/` with mode-specific implementations.

### Docker Deployment (Local/Demo)

For local and demo deployments, use Docker Compose with the `@elmohq/cli` package:

```bash
# Install the CLI globally
npm install -g @elmohq/cli

# Initialize configuration (interactive wizard)
elmo init

# Start the stack
elmo start
```

The `elmo init` command:
1. Prompts for configuration (database, AI credentials)
2. Generates `elmo.yaml` (Docker Compose file) with the appropriate services
3. Generates `.env` with environment variables and secrets
4. Optionally starts the stack immediately

The generated stack includes:
- **web**: Tanstack Start application (port 1515)
- **worker**: pg-boss background worker
- **postgres**: PostgreSQL database (optional, can use external)

### Development Builds

For development builds from source, use the `--dev` flag:

```bash
# Build from local source instead of pulling images
elmo init --dev

# Rebuild after code changes
elmo compose build
elmo compose up -d
```

The Docker build uses a multi-stage `docker/Dockerfile` with separate targets:
- `web` target: TanStack Start / Nitro server
- `worker` target: pg-boss worker process

Both targets receive `DEPLOYMENT_MODE` as a build arg to configure mode-specific behavior at build time.

### Vercel Deployment

When deploying to Vercel:

1. Set the **Root Directory** to `apps/web`
2. Vercel will automatically detect the monorepo structure and build correctly
3. Environment variables should be configured in the Vercel dashboard

## Environment Variables

Environment variables should be placed in a `.env` file at the **root** of the repository. The monorepo scripts are configured to read from this location.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `DEPLOYMENT_MODE` - Deployment mode (local/demo/whitelabel)
- `AUTH0_*` - Auth0 configuration (whitelabel mode)
- `UPSTASH_REDIS_*` - Redis for BullMQ

See `turbo.json` for the full list of global environment variables used across the monorepo.

## Versioning and Releases

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management. All packages in the monorepo are kept on the same version (fixed versioning).

### For External Contributors

1. Fork the repository and create a branch for your changes.

2. Make your changes and add a changeset:

   ```bash
   pnpm changeset
   ```

3. Commit both your changes and the generated changeset file.

4. Open a PR against the `main` branch.

5. A maintainer will review your PR. Once merged, a maintainer will handle the release process.

### Releasing a New Version (Maintainers Only)

When ready to release:

1. **Apply changesets and bump versions** locally:

   ```bash
   pnpm version-packages
   ```

   This will:
   - Consume all pending changeset files
   - Update `package.json` versions for all packages
   - Generate/update `CHANGELOG.md` files

2. **Review and commit** the version changes:

   ```bash
   git add .
   git commit -m "chore: release v$(node -p "require('./apps/cli/package.json').version")"
   git push
   ```

3. **Trigger the release workflow** from GitHub Actions:
   - Go to Actions > Release > Run workflow
   - This will create a GitHub release and publish to Docker Hub and npm.

## Learn More

- [Tanstack Start Documentation](https://tanstack.com/start/latest)
- [Turborepo Documentation](https://turborepo.dev/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Changesets Documentation](https://github.com/changesets/changesets)
