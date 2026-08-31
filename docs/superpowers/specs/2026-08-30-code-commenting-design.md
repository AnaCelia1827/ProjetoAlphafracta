# Code Commenting Design

## Objective

Make the Live Monitor backend easy to review by documenting, in Portuguese,
the responsibility and reasoning of every maintained TypeScript code file and
its relevant constructs without changing runtime behavior.

## Scope

The work covers every maintained `.ts` file in these areas:

- `apps/api/src`: API composition, domain rules, application use cases,
  infrastructure adapters, HTTP/SSE interfaces, configuration and runtime.
- `apps/api/test`: fixtures, fakes and tests.
- `packages/contracts/src` and `packages/contracts/test`: API schemas and their
  executable contract tests.

Generated output, lockfiles, dependencies and non-TypeScript project metadata
are outside the scope. Declaration shims are documented only when they contain
project-specific intent.

## Commenting Standard

Every file receives a module header that answers:

1. What responsibility the file owns.
2. Which layer owns that responsibility.
3. Which collaborators or inputs it receives, when relevant.
4. Which behavior, output or failure mode it produces.

Every exported class, function, interface, type, constant and schema receives
a Portuguese JSDoc comment. Private methods and local helpers are also
documented when they encode a business rule, validation, conversion, lifecycle
step, state transition or error boundary.

Comments explain intent and consequences rather than restating syntax. For
example, a fee estimator comment explains the reason for the 12.5% Base Fee
headroom, while a cursor decoder comment explains that it prevents pagination
queries from being altered between pages.

## Test Documentation

Each test describes the behavior being protected and the production consequence
of regression. Fixtures and fakes describe the external condition they model.
This lets a reviewer understand why a test exists without reverse-engineering
the assertions first.

## Consistency Rules

- Portuguese is used consistently.
- Terminology follows the approved contract: snapshot, last-known, Base Fee,
  mempool, finality, reorg, cursor, SSE and degraded mode.
- Comments do not expose credentials, provider URLs, raw transactions or other
  sensitive data.
- Comments do not alter public APIs, runtime behavior, test behavior or JSON
  contracts.
- Formatting remains Prettier-compatible and lint clean.

## Verification

After the documentation pass, the repository runs the focused and complete test
suites with two forks at most, followed by typecheck, lint, Prettier and a
whitespace diff check. The documentation change is committed and pushed on the
existing feature branch separately from functional changes.
