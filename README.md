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

## Demo

Try the live demo at **[demo.elmohq.com](https://demo.elmohq.com)** to see how Elmo tracks prompts across ChatGPT, Claude, and Google AI Overviews, analyzes the citations behind those answers, and surfaces how your brand and competitors show up over time.

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

See the [docs](https://www.elmohq.com/docs) for getting started, deployment, and the full command reference.

> [!TIP]
> **Watch** this repo's **releases** to get notified of major updates.

## Tech Stack

Elmo runs with [Docker Compose](https://docs.docker.com/compose/), uses [PostgreSQL](https://www.postgresql.org/) as its database, and is built in [TypeScript](https://www.typescriptlang.org/) on [TanStack Start](https://tanstack.com/start/latest) with [pg-boss](https://github.com/timgit/pg-boss) for background jobs.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the [contributor docs](https://www.elmohq.com/docs/contributing) for development setup, commands, architecture, and the release process.

## Contact

- [Discord](https://discord.gg/s24nubCtKz)
- [support@elmohq.com](mailto:support@elmohq.com)
- [Schedule a call](https://cal.com/jrhizor/elmo)

## Repo Activity

![Repobeats analytics image](https://repobeats.axiom.co/api/embed/e602387f6d080bbec1161e6a16dccefb7ab76cca.svg "Repobeats analytics image")
