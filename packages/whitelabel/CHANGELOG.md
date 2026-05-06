# @workspace/whitelabel

## 0.2.6

### Patch Changes

- @workspace/config@0.2.6
- @workspace/lib@0.2.6
- @workspace/ui@0.2.6

## 0.2.5

### Patch Changes

- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.
- Updated dependencies [7990382]
- Updated dependencies [edf97d4]
- Updated dependencies [7cba46d]
- Updated dependencies [839b98b]
  - @workspace/lib@0.2.5
  - @workspace/config@0.2.5
  - @workspace/ui@0.2.5

## 0.2.4

### Patch Changes

- 67a0389: Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode narrows writable `/api/auth/**` endpoints to a whitelist of just sign-in and sign-out. Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.
- Updated dependencies [67a0389]
  - @workspace/lib@0.2.4
  - @workspace/config@0.2.4
  - @workspace/ui@0.2.4

## 0.2.3

### Patch Changes

- @workspace/config@0.2.3
- @workspace/lib@0.2.3
- @workspace/ui@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [63a6c22]
- Updated dependencies [06fb190]
  - @workspace/lib@0.2.2
  - @workspace/config@0.2.2
  - @workspace/ui@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [adf7642]
  - @workspace/lib@0.2.1
  - @workspace/config@0.2.1
  - @workspace/ui@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [95b71db]
  - @workspace/lib@0.2.0
  - @workspace/config@0.2.0
  - @workspace/ui@0.2.0

## 0.1.2

### Patch Changes

- @workspace/config@0.1.2
- @workspace/ui@0.1.2

## 0.1.1

### Patch Changes

- Added changesets to track versions.
- Updated dependencies
  - @workspace/config@0.1.1
  - @workspace/ui@0.1.1
