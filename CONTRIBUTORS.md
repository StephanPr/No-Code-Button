# Contributors

## Why this file exists

No-Code Button (NCB) continues **Low Code Button (LCB)**, the free community Dynamics 365 /
Power Apps tool that turns a command bar or ribbon button into an HTTPS call to a Power
Automate flow. The published history of this repository begins with a snapshot of the source
tree rather than the original commits, so the commit log on its own would lose the authorship
of the work. This file records the attribution in words.

The identity-level record of the original history — the Git author names and email addresses
exactly as they were committed, the per-identity commit counts and date ranges, and the places
where that history is ambiguous — is preserved in the project's private archive. It is not
published here: those addresses are private, and one original identity committed from a former
employer's domain that the contributors have asked to keep out of the project's documentation.
The LCB naming stays in the product (the `LCB` global, the `esp_*` tables, the web resource
names) until the separate rebranding pass, so both names refer to the same software.

## Authors of Low Code Button

Written between 2025-03-18 and 2025-04-04 (61 commits, plus two documentation-only updates, the
last on 2026-07-14) by:

| Person | Role in the original project | Public identification |
|---|---|---|
| José Martínez Lago | Co-creator and developer; the `esp_*` data model, the settings app, the runtime pipeline | [LinkedIn](https://www.linkedin.com/in/martinezlago/) |
| Stephan Charles | Co-creator and developer; grid and subgrid support, the OnSave/v2 work, the settings-form synchronisation | [LinkedIn](https://www.linkedin.com/in/stephan-charles-nielson/) |

Both are named in the published documentation of the original project — `readme.md` (Support)
and the `author` field of `package.json` ("José Martínez Lago & SCN") — and both agreed on
2026-10-30 to release the work under the Apache License, Version 2.0.

## Maintainers of No-Code Button

| Person | Role | Public identification |
|---|---|---|
| Stephan Charles | Maintainer of this repository | GitHub [`StephanPr`](https://github.com/StephanPr) |
| José Martínez Lago | Co-developer of the continuation | [LinkedIn](https://www.linkedin.com/in/martinezlago/) |

## What the published history cannot prove

Recorded so that nobody over-reads this file:

- **Copyright holder.** Nothing in the repository, the readme or the commit metadata names a
  legal entity as the copyright holder, and there is no contributor license agreement, DCO or
  assignment. `NOTICE` therefore uses the collective form "The Low Code Button authors" plus the
  two named developers. If an employer holds copyright in some of the original commits, the
  maintainers have to add that holder to `NOTICE`; nothing available here settles that either
  way. The relicensing is recorded as the decision of the two named developers, not of an entity.
- **No per-file claim.** Commit counts are not a measure of contribution, and no authorship claim
  is made here for an individual file. For a specific file in this repository, run
  `git log --follow --format="%h %an %ad" --date=short -- <path>`. For the original history, that
  log lives in the private archive.
- **Attribution, not endorsement.** Naming a person records who wrote the code. It does not make
  them responsible for a fork or a derivative of it.

## Adding yourself

Contributions to No-Code Button are licensed under the Apache License 2.0 by the act of
submitting them, per Section 5 of that license; nothing has to be signed separately. Open a pull
request and add one row to the table above with the name you want published, the GitHub account
you contribute from, and the period you worked on. If you contribute from more than one email
address, add a `.mailmap` entry instead of asking for a history rewrite. Do not edit the Low Code
Button section above: it is a record of the original project, and a correction there needs the
evidence that supports it.
