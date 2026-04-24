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
elmo start

# 3. Open the app at http://localhost:1515
```

`elmo init` will prompt you for a few things (database, AI provider credentials), generate `elmo.yaml` and `.env`, and optionally start the stack for you.

For the full self-hosting walkthrough, see the [Elmo docs](https://www.elmohq.com/docs).

## Commands

| Command | Description |
| --- | --- |
| `elmo init` | Interactive wizard to set up a local Elmo instance |
| `elmo start` | Start the Elmo stack |
| `elmo stop` | Stop the Elmo stack |
| `elmo status` | Check the health of running services |
| `elmo logs [service]` | Tail container logs (pass `-f` to follow) |
| `elmo regen` | Regenerate `elmo.yaml` / `.env` from your saved config |
| `elmo compose <args...>` | Run any `docker compose` command against your Elmo project |
| `elmo build` | Build Docker images locally (for `--dev` installs) |

Run `elmo --help` or `elmo <command> --help` for the full list of flags.

### Useful flags

- `--dir <path>` — point any command at a specific config directory (defaults to `~/.config/elmo`).
- `elmo init --dev` — build images from a local checkout of the repo instead of pulling from the registry.

## Telemetry

The CLI sends anonymous install and command events so we can understand which flows people use and where setup breaks. To opt out, set:

```bash
export DISABLE_TELEMETRY=1
```

## Star, contribute, and chat

Elmo is built in the open and we'd love your help.

- ⭐ **[Star us on GitHub](https://github.com/elmohq/elmo)** — it genuinely helps more people find the project.
- 💬 **[Join the Discord](https://discord.gg/s24nubCtKz)** — get help, share what you're building, and talk to the team.
- 🐛 **[File an issue](https://github.com/elmohq/elmo/issues)** if something breaks or you have a feature request.
- 🛠️ **[Read the contributing guide](https://github.com/elmohq/elmo/blob/main/README.md#versioning-and-releases)** to send a PR.
