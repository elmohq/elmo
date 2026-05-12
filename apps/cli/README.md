<p align="center">
  <a href="https://github.com/elmohq/elmo">
    <img src="https://raw.githubusercontent.com/elmohq/elmo/main/apps/www/public/brand/logos/elmo-logo-xl.png" alt="Elmo" width="300">
  </a>
</p>

<p align="center">
  The official CLI for <a href="https://www.elmohq.com/">Elmo</a> — open source AI visibility tracking and optimization.
  <br />
  <br />
  <a href="https://www.elmohq.com/docs"><strong>Read the docs »</strong></a>
</p>

<br />

<p align="center">
  <a href="https://www.npmjs.com/package/@elmohq/cli"><img src="https://img.shields.io/npm/v/@elmohq/cli?color=2563eb&label=npm" alt="npm version"></a>&nbsp;
  <a href="https://www.elmohq.com/docs"><img src="https://img.shields.io/badge/Docs-2563eb?style=flat&logo=readthedocs&logoColor=white" alt="Docs"></a>&nbsp;
  <a href="https://demo.elmohq.com"><img src="https://img.shields.io/badge/Demo-22c55e?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNSAxNGMuMi0xIC43LTEuNyAxLjUtMi41IDEtLjkgMS41LTIuMiAxLjUtMy41QTYgNiAwIDAgMCA2IDhjMCAxIC4yIDIuMiAxLjUgMy41LjcuNyAxLjMgMS41IDEuNSAyLjUiLz48cGF0aCBkPSJNOSAxOGg2Ii8+PHBhdGggZD0iTTEwIDIyaDQiLz48L3N2Zz4%3D" alt="Demo"></a>&nbsp;
  <a href="https://github.com/elmohq/elmo"><img src="https://img.shields.io/github/stars/elmohq/elmo?style=flat&logo=github&color=ee964b&label=Star" alt="GitHub stars"></a>&nbsp;
  <a href="https://discord.gg/s24nubCtKz"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<br />

## What is Elmo?

[Elmo](https://www.elmohq.com/) is an open source platform for tracking and optimizing how your brand shows up in AI assistants like ChatGPT, Claude, Gemini, and Perplexity. Define the prompts your customers ask, run them across providers on a schedule, and get visibility into mentions, sentiment, citations, and competitor positioning over time.

`@elmohq/cli` is the fastest way to run Elmo on your own infrastructure. It generates a Docker Compose stack, manages secrets and configuration, and gives you a single command to start, stop, and operate your instance.

## Installation

```bash
npm install -g @elmohq/cli
```

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

## Quick Start

```bash
# 1. Walk through the interactive setup wizard
elmo init

# 2. Start the stack
elmo compose up -d

# 3. Open the app at http://localhost:1515
```

`elmo init` will prompt you for a few things (database, AI provider credentials), generate `elmo.yaml` and `.env`, and optionally start the stack for you.

For the full self-hosting walkthrough, see the [Elmo docs](https://www.elmohq.com/docs).

## Commands

| Command | Description |
| --- | --- |
| `elmo init` | Interactive wizard to set up a local Elmo instance |
| `elmo compose <args...>` | Run any `docker compose` command against your Elmo project (e.g. `elmo compose up -d`, `elmo compose down`, `elmo compose logs -f`, `elmo compose build`, `elmo compose ps`) |
| `elmo edit <env\|compose>` | Change API keys, scrape targets, or the Docker Compose YAML |

Run `elmo --help` or `elmo <command> --help` for the full list of flags.

### Useful flags

- `--dir <path>` — point any command at a specific config directory (defaults to `~/.elmo`).
- `elmo init --dev` — build images from a local checkout of the repo instead of pulling from the registry.

## Telemetry

The CLI sends anonymous install and command events so we can understand which flows people use and where setup breaks. To opt out, either export `DISABLE_TELEMETRY=1` in your shell, or add it to your `.env`:

```bash
elmo edit env       # add DISABLE_TELEMETRY=1
elmo compose up -d  # restart so the deployment picks it up
```

See [the telemetry docs](https://www.elmohq.com/docs/developer-guide/telemetry) for details on what is collected.

## Star, contribute, and chat

Elmo is built in the open and we'd love your help.

- ⭐ **[Star us on GitHub](https://github.com/elmohq/elmo)** — it genuinely helps more people find the project.
- 💬 **[Join the Discord](https://discord.gg/s24nubCtKz)** — get help, share what you're building, and talk to the team.
- 🐛 **[File an issue](https://github.com/elmohq/elmo/issues)** if something breaks or you have a feature request.
