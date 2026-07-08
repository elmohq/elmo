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

## About

Elmo is an open-source, self-hosted platform for optimizing your AI visibility, which is also known as:
* Answer Engine Optimization (AEO)
* Generative Engine Optimization (GEO)
* LLM Optimization (LLMO, which is where the name Elmo is from)

Elmo tracks how AI answer engines like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention, cite, and describe your brand, so you can benchmark competitors and grow your visibility in AI answers.

It's a free alternative to tools like [Profound](https://www.elmohq.com/ai-visibility-tools/profound), [Peec](https://www.elmohq.com/ai-visibility-tools/peec-ai), and [Otterly](https://www.elmohq.com/ai-visibility-tools/otterly-ai). You can run it on your own infrastructure, own your data, and audit exactly how every metric is calculated.

## Demo

Try the live demo at **[demo.elmohq.com](https://demo.elmohq.com)** to see how Elmo tracks prompts and analyzes citations.

## Quick Start

For local deployments, use Docker Compose as configured with the `@elmohq/cli` package:

```bash
# Install the CLI globally
npm install -g @elmohq/cli

# Initialize configuration (interactive wizard)
elmo init

# Start the stack
elmo compose up -d
```

> [!TIP]
> **Watch** this repo's **releases** to get notified of major updates.

## Architecture

<p align="center">
  <img src="apps/www/public/brand/architecture.svg" alt="Elmo system architecture" width="100%">
</p>

## Tech Stack

- [Docker Compose](https://docs.docker.com/compose/)
- [PostgreSQL](https://www.postgresql.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [TanStack Start](https://tanstack.com/start/latest)
- [pg-boss](https://github.com/timgit/pg-boss)

## Contact

- [Discord](https://discord.gg/s24nubCtKz)
- [Email](mailto:support@elmohq.com)
- [Schedule a call](https://cal.com/jrhizor/elmo)

## Repo Activity

![Repository activity](https://www.elmohq.com/api/repobeats.svg "Repository activity")
