# Contributing to Elmo

Thanks for your interest in contributing! This document covers what you need
to know before opening a pull request. For deeper guides on development
setup, architecture, and commands, see the
[contributor docs](https://www.elmohq.com/docs/contributing).

## License

Elmo is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE.md).
By contributing, you agree that your contributions will be licensed under the
same terms. You retain copyright in your contributions.

## How to Contribute

1. **Find or open an issue.** For non-trivial changes, please discuss in an
   issue first so we can agree on the approach before you spend time on it.
   Browse [open issues](https://github.com/elmohq/elmo/issues) for things to
   work on.
2. **Fork** the repository and create a feature branch.
3. **Set up your environment** — see
   [Development Setup](https://www.elmohq.com/docs/contributing/development-setup).
4. **Make your changes** and add tests where applicable.
5. **Add a changeset** describing user-visible changes:
   ```bash
   pnpm changeset
   ```
6. **Open a pull request** against the `main` branch. Keep PRs focused —
   one feature or fix per PR.

A maintainer will review your PR. Once approved and merged, a maintainer
handles the release.

## Guidelines

- Follow the existing code style — Biome handles linting and formatting
  (`pnpm lint`, `pnpm format`).
- Write tests for new features and bug fixes when practical.
- Read the [AI Contribution Policy](https://www.elmohq.com/docs/contributing/ai-policy)
  if you use AI tools while contributing.
- Don't include proprietary or third-party code unless its license is
  compatible with AGPLv3 — see
  [`scripts/check-licenses.mjs`](scripts/check-licenses.mjs) for the
  allow-list.

## Code of Conduct

By participating in this project you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). Report violations to
[conduct@elmohq.com](mailto:conduct@elmohq.com).

## Reporting Security Issues

Please do not open a public issue for security vulnerabilities. Email
[security@elmohq.com](mailto:security@elmohq.com) instead — see
[`SECURITY.md`](SECURITY.md) for details.

## Questions?

- [Discord](https://discord.gg/s24nubCtKz) — fastest way to ask questions.
- [GitHub Issues](https://github.com/elmohq/elmo/issues) — for bug reports
  and feature requests.
- [Schedule a call](https://cal.com/jrhizor/elmo) — for anything else.
