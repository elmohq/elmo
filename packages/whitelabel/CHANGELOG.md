# @workspace/whitelabel

## 0.3.0

### Patch Changes

- d4e5db4: Whitelabel sign-in no longer creates organizations from Auth0 `app_metadata`; it only grants membership in organizations that already exist, which are provisioned through the admin brands API.
- da87272: Rebuilt the interface on Base UI, so menus, dialogs, tooltips and form controls behave more consistently across keyboard and assistive tech.
- Updated dependencies [1f32756]
- Updated dependencies [d4e5db4]
- Updated dependencies [da87272]
- Updated dependencies [3ba2e5a]
- Updated dependencies [9633ca2]
- Updated dependencies [78593b9]
- Updated dependencies [1f32756]
- Updated dependencies [1f32756]
- Updated dependencies [78593b9]
- Updated dependencies [f4f7ef2]
- Updated dependencies [78593b9]
- Updated dependencies [f87d2e2]
- Updated dependencies [f87d2e2]
- Updated dependencies [58ff775]
- Updated dependencies [1f46b62]
- Updated dependencies [1c4d39c]
- Updated dependencies [78593b9]
- Updated dependencies [78593b9]
- Updated dependencies [78593b9]
  - @workspace/lib@0.3.0
  - @workspace/ui@0.3.0
  - @workspace/config@0.3.0

## 0.2.19

### Patch Changes

- Updated dependencies [dac89d4]
  - @workspace/lib@0.2.19
  - @workspace/config@0.2.19
  - @workspace/ui@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [d0187ed]
- Updated dependencies [bfa6282]
- Updated dependencies [9394d65]
- Updated dependencies [d9faaec]
- Updated dependencies [72e7091]
  - @workspace/lib@0.2.18
  - @workspace/config@0.2.18
  - @workspace/ui@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [5a0a40c]
  - @workspace/ui@0.2.17
  - @workspace/config@0.2.17
  - @workspace/lib@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies [91de584]
  - @workspace/lib@0.2.16
  - @workspace/config@0.2.16
  - @workspace/ui@0.2.16

## 0.2.15

### Patch Changes

- @workspace/config@0.2.15
- @workspace/lib@0.2.15
- @workspace/ui@0.2.15

## 0.2.14

### Patch Changes

- @workspace/config@0.2.14
- @workspace/lib@0.2.14
- @workspace/ui@0.2.14

## 0.2.13

### Patch Changes

- @workspace/config@0.2.13
- @workspace/lib@0.2.13
- @workspace/ui@0.2.13

## 0.2.12

### Patch Changes

- @workspace/config@0.2.12
- @workspace/lib@0.2.12
- @workspace/ui@0.2.12

## 0.2.11

### Patch Changes

- @workspace/config@0.2.11
- @workspace/lib@0.2.11
- @workspace/ui@0.2.11

## 0.2.10

### Patch Changes

- Updated dependencies [520aef4]
  - @workspace/lib@0.2.10
  - @workspace/config@0.2.10
  - @workspace/ui@0.2.10

## 0.2.9

### Patch Changes

- @workspace/config@0.2.9
- @workspace/lib@0.2.9
- @workspace/ui@0.2.9

## 0.2.8

### Patch Changes

- @workspace/config@0.2.8
- @workspace/lib@0.2.8
- @workspace/ui@0.2.8

## 0.2.7

### Patch Changes

- @workspace/config@0.2.7
- @workspace/lib@0.2.7
- @workspace/ui@0.2.7

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
