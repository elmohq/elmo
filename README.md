# Elmo

A monorepo project built with [Next.js](https://nextjs.org), [Turborepo](https://turborepo.dev), and [shadcn/ui](https://ui.shadcn.com).

## Project Structure

```
apps/
└── web/          # Next.js application
    ├── src/
    │   ├── app/        # Next.js app router
    │   ├── components/ # Application-specific components
    │   ├── hooks/      # Application-specific hooks
    │   └── lib/        # Utilities, database, etc.
    ├── scripts/        # CLI scripts
    └── tinybird/       # Tinybird analytics

packages/
└── ui/           # Shared UI components (shadcn/ui)
    └── src/
        ├── components/ # UI components (button, card, etc.)
        ├── hooks/      # UI hooks (use-mobile, etc.)
        ├── lib/        # UI utilities (cn)
        └── styles/     # Global CSS variables
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

### Build

Build all packages:

```bash
pnpm build
```

### Testing

Run tests:

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

### Format

```bash
pnpm format
```

## Working with UI Components

### Adding New shadcn/ui Components

To add new shadcn/ui components, navigate to the web app directory and run:

```bash
cd apps/web
pnpm dlx shadcn@latest add [COMPONENT]
```

The CLI will automatically install:
- Base UI components to `packages/ui/src/components/`
- Application-specific components to `apps/web/src/components/`

### Importing Components

Import UI components from the `@workspace/ui` package:

```tsx
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
```

## Workers

### Queue Dashboard

```bash
pnpm --filter @workspace/web queuedash
```

### Worker (Development)

```bash
pnpm --filter @workspace/web worker:dev
```

### Worker (Production)

```bash
pnpm --filter @workspace/web worker:prod
```

## Database

This project uses Drizzle ORM with PostgreSQL.

### Generate Migrations

```bash
cd apps/web
pnpm drizzle-kit generate
```

### Run Migrations

```bash
cd apps/web
pnpm drizzle-kit migrate
```

## Environment Variables

Environment variables should be placed in a `.env` file at the **root** of the repository. The monorepo scripts are configured to read from this location.

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- See `.env.example` for the full list

## Deployment

### Vercel

When deploying to Vercel:

1. Set the **Root Directory** to `apps/web`
2. Vercel will automatically detect the monorepo structure and build correctly
3. Environment variables should be configured in the Vercel dashboard

The build command will automatically run tests before building.

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

- [Next.js Documentation](https://nextjs.org/docs)
- [Turborepo Documentation](https://turborepo.dev/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Changesets Documentation](https://github.com/changesets/changesets)
