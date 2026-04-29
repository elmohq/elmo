# Security Policy

## Supported Versions

We apply security fixes only to the **latest released version** of Elmo. If
you are running an older version, please upgrade before reporting an issue.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email [security@elmohq.com](mailto:security@elmohq.com) with:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept code is helpful)
- The version or commit you tested against
- Your name or handle if you'd like to be credited in the disclosure

Please give us a reasonable amount of time to investigate and release a fix
before any public disclosure.

## Scope

In scope:

- The Elmo web app, worker, CLI, and published packages in this repository
- Default deployment configurations shipped with `@elmohq/cli`

Out of scope:

- Issues in third-party dependencies (please report those upstream; we'll
  pick up fixed versions in a normal release)
- Self-hosted deployments where the operator has modified Elmo or its
  configuration in a way that introduces the vulnerability
