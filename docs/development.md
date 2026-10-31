# Development guide

This repository is the source of three Dataverse **JavaScript web resources**. There is no server,
no database, no framework and no npm package consumed by users: TypeScript is compiled by webpack
into standalone bundles that run inside the model-driven app client in a browser, and the only
runtime contract is the global `Xrm` object plus `fetch`.

## What ships

| Entry (TypeScript) | Web resource (JavaScript) | Public API it defines |
|---|---|---|
| `src/LowCodeButtonBase.ts` | `dist/LowCodeButtonBase.js` | `LCB.ButtonRegistration.onClick(context, buttonName)` — the command a button calls |
| `src/LowCodeButtonSetting.ts` | `dist/LowCodeButtonSetting.js` | `LCB.ButtonSetting.onLoad` / `onChange` — handlers of the Button Setting form |
| `src/LowCodeButtonAdvancedSetting.ts` | `dist/LowCodeButtonAdvancedSetting.js` | `LCB.FormLogic.*`, `LCB.OnSaveLogic.*` — handlers of the Advanced Setting form |

`webpack.common.js` turns **every top-level `src/*.ts` into its own bundle**, so the file name is
the web-resource file name and the exported names are the public `LCB.*` API. Both are referenced
verbatim by command bar and ribbon definitions in installed solutions: renaming an entry, the `LCB`
library or one of those static methods breaks every existing installation, it is not a refactor.
Everything below `src/` (helpers, models, exceptions, base cases, generated types) is a module
pulled into one of the three bundles and is free to move.

`dist/` is committed together with the `src/` change it came from, because the release process
copies those files straight into the solution's web resources. Build the release configuration
(`npm run dist`), never paste a development bundle into a solution, and keep `dist/` in step with
`src/` in the same commit.

## Commands

```bash
npm ci                 # install the exact locked dev toolchain
npm run check          # type-check + lint + unit tests: the gate before any commit
npm run typecheck      # tsc --noEmit
npm test               # vitest run (the pure-logic specs under tests/)
npm run lint           # eslint src --ext .ts
npm run build          # development bundles with source maps
npm run dist           # release bundles, minified — this is what a web resource must contain
npm start              # webpack watch; a long-lived process you have to stop yourself
```

TypeScript is `target: ES5`, `module: commonjs`, `strict: true`. The ES5 target is what keeps the
bundles parseable across the supported Dynamics 365 client matrix; raising it is a documented
release decision, not a cleanup. Runtime dependencies are compile-time or type-only. Adding one that
reaches a bundle means inlining it into public code: it must work under ES5, the bundle must still
add only the `LCB` global, and `NOTICE` must record its license.

## Layout

```
src/*.ts              the three web-resource entries; thin dispatchers, no logic
src/Base_Cases/       form and grid click orchestration (one file per container family)
src/Helpers/          every decision: detection, settings retrieval, payload, HTTP, dialogs
src/Models/           response bodies (redirect, error) with validating fromJson parsers
src/Exceptions/       the single place an error dialog is raised
src/dataverse-gen/    generated entity and choice types - do not hand-edit
tests/                vitest specs (Node); never a webpack entry
dist/                 the compiled web resources, tracked on purpose
DataStructure/        the entity model note and the language reference data
```

## Generated Dataverse types

`src/dataverse-gen/` is generated from the `esp_*` schema by `dataverse-gen`, driven by
`.dataverse-gen.json`, and every generated file starts with `/* eslint-disable*/`. Do not hand-patch
a generated file: the next regeneration silently reverts it. Change the schema in the Dataverse
solution first, regenerate against an environment that has the change, and commit the output. Use the
generated `*Attributes` constants and the generated choice enums instead of repeating `"esp_…"`
strings or comparing against raw option numbers — option integers are per-organisation, the enum is
the documentation.

## Testing

`npm test` runs the vitest specs in `tests/`, covering the decisions that do not need a browser:
which container a click happened in, which keys a payload carries for a form, a grid and a subgrid,
how the two response models validate a body, and that a grid click with no selection sends nothing.
`tests/support/xrm-stub.ts` fakes the `Xrm` global and `fetch` is stubbed per spec, so the suite
contacts no org and no network.

A green suite is a floor, not a finish line. Only a real client can prove that the web resource loads
and `LCB` is defined, that the command is wired to a button in the Command Bar Designer or Ribbon
Workbench, that the `Xrm.Navigation` dialogs and notifications behave as intended, that a flow
receives the payload and answers in the documented shape, and that the managed solution imports.
Plan that check against a Dataverse environment before calling a change done.

## Packaging

The distributable is a **managed solution assembled by hand inside a Dataverse environment**: the
built JavaScript goes into the solution's web resources, and the `esp_*` tables, forms, views, site
map, security roles and the settings app live in the same solution; the exported managed solution is
published as a release of this repository. Nothing here produces the `.zip`, and there is no CI. The
installation steps users follow are in [`readme.md`](../readme.md).

## Changing behaviour, changing the docs

`readme.md` is the published contract: payload keys, response shapes an endpoint may return,
status-code behaviour, setup steps and limitations are what users and their flows depend on. When you
change any of it, update `readme.md` in the same change. `DataStructure/erd.txt` is the entity model
note and is kept in step with the schema.
