<p align="center">
  <a href="https://github.com/elmohq/elmo">
    <img src="apps/www/public/brand/logos/elmo-logo-xl.png" alt="Elmo" width="300">
  </a>
</p>

<p align="center">
  Open source AI visibility tracking and optimization.
  <br />
  <br />
  <a href="https://www.elmohq.com/"><strong>Learn more »</strong></a>
</p>

<br />

<p align="center">
  <a href="https://www.elmohq.com/docs"><img src="https://img.shields.io/badge/Docs-2563eb?style=flat&logo=readthedocs&logoColor=white" alt="Docs"></a>&nbsp;
  <a href="https://demo.elmohq.com"><img src="https://img.shields.io/badge/Demo-22c55e?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNSAxNGMuMi0xIC43LTEuNyAxLjUtMi41IDEtLjkgMS41LTIuMiAxLjUtMy41QTYgNiAwIDAgMCA2IDhjMCAxIC4yIDIuMiAxLjUgMy41LjcuNyAxLjMgMS41IDEuNSAyLjUiLz48cGF0aCBkPSJNOSAxOGg2Ii8+PHBhdGggZD0iTTEwIDIyaDQiLz48L3N2Zz4%3D" alt="Demo"></a>&nbsp;
  <a href="https://github.com/elmohq/elmo/issues"><img src="https://img.shields.io/badge/Issues-f95738?style=flat&logo=github&logoColor=white" alt="Issues"></a>&nbsp;
  <a href="https://github.com/orgs/elmohq/projects/3/views/1"><img src="https://img.shields.io/badge/Roadmap-ee964b?style=flat&logo=github&logoColor=white" alt="Roadmap"></a>&nbsp;
  <a href="https://discord.gg/s24nubCtKz"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<br />

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

> [!TIP]
> **Watch** this repo's **releases** to get notified of major updates.

## Tech Stack

- **Language**: TypeScript 5.x
- **Framework**: Next.js 16.x (App Router with Turbopack)
- **Styling**: Tailwind CSS v4
- **Component Library**: shadcn/ui (new-york style)
- **Data Fetching**: SWR
- **Database**: Drizzle ORM with PostgreSQL
- **Analytics**: PostgreSQL with covering indices
- **Job Queue**: pg-boss (Postgres-based)
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
│   └── worker/                 # Background job worker (pg-boss)
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

## Telemetry

Elmo collects usage data to help us understand how the product is being used and improve it. This includes CLI install events and web app usage metrics (page views, feature usage, user identification via email).

To disable all telemetry, set the following environment variable:

```bash
DISABLE_TELEMETRY=1
```

For Docker deployments, add this to your `.env` file. For the CLI, export it in your shell or prefix it before commands.

## Contact

Have questions or want to chat about Elmo? [Schedule a call](https://cal.com/jrhizor/elmo).

## Learn More

- [Tanstack Start Documentation](https://tanstack.com/start/latest)
- [Turborepo Documentation](https://turborepo.dev/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Changesets Documentation](https://github.com/changesets/changesets)

## Repo Activity

![Repobeats analytics image](https://repobeats.axiom.co/api/embed/e602387f6d080bbec1161e6a16dccefb7ab76cca.svg "Repobeats analytics image")
