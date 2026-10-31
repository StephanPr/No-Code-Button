# Architecture

How a click becomes an HTTP call, and where each decision lives. This describes the code as it is;
[`readme.md`](../readme.md) states what users and their flows can depend on.

## One pipeline

```
onClick(context, buttonName)
  → detect container (form | grid | subgrid)
  → load the button setting by name
  → load the advanced setting for the user's language (LCID)
  → confirmation dialog → optional form save
  → build the payload from the include flags
  → POST to the configured endpoint
  → interpret the status
  → notification, dialog or redirect → refresh
```

A button never grows its own copy of a step. Context detection exists once
(`BaseHelper.getButtonLocation`), settings retrieval exists once (`BaseHelper.initializeSettings`),
the HTTP call exists once (`BaseHelper.makeRequest`), the payload builder exists once per container
type (`getPayload`), and the error dialog exists once (`ExceptionLowCodeButton`). Status
interpretation exists in the two base cases — and identically in both: a rule that changes for a form
button changes for a grid button in the same commit.

## Entry and containers

`LCB.ButtonRegistration.onClick(context, buttonName)` is the only public entry. It rejects a missing
context or a missing name with a dialog, asks `BaseHelper` which container it was handed, and
dispatches to `ButtonRegistrationForm` or `ButtonRegistrationGrid`. Detection duck-types the client
object rather than trusting a declared type: a `data` member means form, a `getGrid` member means
grid, and a grid whose `getParent()` returns a form context is a subgrid. Nothing downstream
re-derives "am I in a subgrid" — a subgrid button needs both pieces of evidence, the setting
configured as Subgrid and a real parent form context.

## Configuration model

Three tables drive everything, and the click path only reads them:

| Table | Keyed by | What it holds |
|---|---|---|
| `esp_buttonsetting` | `esp_buttonname` (an alternate key — the string the button passes) | where the button lives, which endpoint to call, which payload fields to include, whether to save first |
| `esp_buttonadvancedsetting` | the button setting **plus one language** | all user-facing text (dialog, notifications, spinner), execution mode, confirmation and redirect behaviour, the modification-needed flag |
| `esp_language` | `esp_lcid` | the language rows the advanced setting is chosen from |

The advanced setting is resolved for the **current user's LCID only**. A missing row is reported as
"not found for the LCID …" and the flow stops; it never silently falls back to another language's
strings, because a blank or foreign notification would still look like a working button. Editing the
text in one language flags the sibling rows of the same button as needing the same edit — that
synchronisation is the settings form's job, never the click path's.

`DataStructure/erd.txt` is the attribute-level model.

## Dataverse access

All reads go through `BaseHelper` over the Web API with FetchXML, addressed at
`Xrm.Utility.getGlobalContext().getClientUrl()` plus `/api/data/v9.1/`. No other module calls `fetch`
against the Web API, no org URL is ever hardcoded, and no URL that arrived in a response body is
followed as a trusted base. The bundle runs in the signed-in user's browser session and is itself
public code, which is why it carries no token, no key and no callback URL: the endpoint is
configuration the administrator puts on the setting record.

Values that reach a FetchXML condition are GUIDs, LCIDs and ids validated as such, with the whole
query string encoded. Display text never becomes a key; `esp_buttonname` and `esp_lcid` are.


## Payload

The payload is a pure function of the include flags on the setting plus the container, and its keys
are the contract customer flows are written against. A form button sends `entityLogicalSingularName`;
grid and subgrid buttons send `entityLogicalName` — that asymmetry is published and stays. A subgrid
adds `parentEntityLogicalName`, `parentEntityLogicalPluralName` and `parentRecordId`. Record ids leave
the browser brace-stripped and lower-cased, and a grid or subgrid click with no selection sends
nothing at all: the request never leaves the browser. The full key table is in `readme.md`, and
`tests/payload.test.ts` pins it — adding a field means the attribute, both helpers where it applies,
the example-payload preview on the settings form, the readme table and the test. Five places, once.

## Execution mode and the response

**Async** is fire-and-forget on purpose. The user is told the request was sent, and nothing more: the
response body is not inspected, no dialog or redirect follows, and no refresh is driven by it. **Sync**
lets the response drive everything, with the spinner opened in one place and closed in `finally` so no
response shape can leak a stuck progress indicator. The status branches are exact and identical in both
base cases:

| Status | Behaviour |
|---|---|
| `400` | parse the body as an error message and show it (title optional, message required) |
| `>= 500` | show the status code plus the raw response text |
| `200` | success notification, then the success dialog or a redirect from `redirectUri`, then refresh |
| anything else | the flow ends without a UI decision — a gap, not an implicit success |

Bodies are parsed only through `RedirectResponse.fromJson` / `ErrorMessageResponse.fromJson`, which
validate the shape, tell the user what is missing and throw so the caller stops; no caller reads a raw
body field itself. A dialog the user cancels is a normal outcome, not an error, and leaves the
notifications cleared.

## Boundaries

- **Read-only at click time.** The click path reads records and POSTs to the configured endpoint. Its
  only write to Dataverse is the optional `formContext.data.save()` of the record the user was already
  editing. The remaining writes happen in the settings-form handlers, on `esp_buttonadvancedsetting`
  only, through `Xrm.WebApi.updateRecord`.
- **Configuration strings are data.** Button names, endpoints, notification text and everything inside
  a flow response are rendered, never evaluated, never spliced into a URL or path, never inserted into
  markup the client parses.
- **Nothing waits beyond the click.** No polling, no background timer, no second route into a request,
  no quiet retry of a POST a flow may already have processed. The user clicks again, knowingly.
- **Failures are named.** "An error occurred" is not an acceptable message here: the dialog says which
  setting, which LCID, which field or which endpoint is missing, so a maker can fix it without reading
  source. Every failure ends in `ExceptionLowCodeButton`, the single alert surface.

## Two siblings, not a fork

`LowCodeButtonFormBase` and `LowCodeButtonGridBase` are deliberate parallels over
`ButtonFormHelper` and `ButtonGridHelper`; they differ because their client contexts differ, not
because either is allowed to drift. There is no shared base contract between them yet, and introducing
one is an architectural decision rather than a refactor to slip into a fix. Divergence between the two
is this project's main defect class: read both when reviewing anything that touches a status code, a
notification or a spinner.
