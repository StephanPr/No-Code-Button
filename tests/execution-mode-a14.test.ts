/* eslint-disable camelcase */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonRegistrationForm } from "../src/Base_Cases/NoCodeButtonFormBase";
import { ButtonRegistrationGrid } from "../src/Base_Cases/NoCodeButtonGridBase";
import {
  esp_buttonadvancedsetting_esp_buttonadvancedsetting_esp_executionmode as ExecutionMode,
  esp_buttonadvancedsetting_esp_buttonadvancedsetting_esp_syncconfirmationboxtype as BoxType,
} from "../src/dataverse-gen";
import type { esp_ButtonAdvancedSetting } from "../src/dataverse-gen";
import { installHttpStub, type EndpointAnswer, type HttpSpy } from "./support/http";
import {
  buildAdvancedSetting,
  buildButtonSetting,
  buildFormContext,
  buildGridControl,
  createFormRecorder,
  installXrmStub,
  type FormRecorder,
  type XrmSpy,
} from "./support/xrm-stub";

/**
 * A14 — the execution-mode contract, and what the runtime actually does today.
 *
 * A14 says the runtime must read the execution-mode choice **explicitly**: a value that is a member of
 * the option set performs that mode's action; a value that is missing, null, or outside the option set
 * raises an actionable error and sends **no request at all**. That validator does not exist yet, and R2
 * is forbidden to add one — writing it now would also mean inventing `ncb_*` schema and option values
 * that only a regenerated `src/dataverse-gen` from a real org can supply (D-14).
 *
 * This file separates three things deliberately:
 *   1. `A14_CONTRACT` — the approved contract as a machine-readable fixture. No product behaviour is
 *      asserted from it yet, so it cannot drift into looking implemented.
 *   2. Executable characterisation — what the code does today for exactly those cases. These are green
 *      now and are **expected to fail** when the A14 validator lands; rewriting them belongs in that
 *      commit and must not happen by accident on the way to something else.
 *   3. `it.skip` specifications — the target behaviour, enabled by the fix.
 *
 * Everything runs through the real base cases with a faked `Xrm` and `fetch`: no network, no org. What
 * stays unverified is what only an org can answer — the real integers of a customer's option set.
 */

/** A number that is not a member of the execution-mode option set; it stands for "configured wrong". */
const NOT_A_MODE = -1;

/** The value the shared fixture hands the pre-existing suite; it is not a member of the option set. */
const FIXTURE_DEFAULT_MODE = buildAdvancedSetting().esp_executionmode;

type ModeExpectation = "sync-action" | "async-action" | "error-and-no-request";

interface ModeCase {
  label: string;
  mode: number | null | undefined;
  expectation: ModeExpectation;
}

/** The approved A14 contract. Valid `mode` values come from the generated enum, never a typed integer. */
const A14_CONTRACT: ModeCase[] = [
  { label: "the stored Sync value", mode: ExecutionMode.Sync, expectation: "sync-action" },
  { label: "the stored Async value", mode: ExecutionMode.Async, expectation: "async-action" },
  { label: "the choice was cleared", mode: null, expectation: "error-and-no-request" },
  { label: "the attribute is absent", mode: undefined, expectation: "error-and-no-request" },
  { label: "a value outside the option set", mode: NOT_A_MODE, expectation: "error-and-no-request" },
];

const BUTTON_NAME = "MyButton";
const GRID_ROW_ID = "{E2A1B318-BF22-8819-A123-568930BD1234}";
const OK_ANSWER: EndpointAnswer = { status: 200, body: "" };
const SUCCESS_DIALOG = { title: "Done", text: "The action finished." };

describe("A14 characterisation — what the click path does with each execution-mode value today", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("the option set has the two documented members and the sentinel sits outside it", () => {
    const members = [ExecutionMode.Sync, ExecutionMode.Async];
    expect(members).toHaveLength(2);
    expect(members).not.toContain(NOT_A_MODE);
    // Honest note on the shared fixture: the value the pre-existing suite gives every button is itself
    // not a member of the option set, so "unknown mode" is not a hypothetical corner case.
    expect(members).not.toContain(FIXTURE_DEFAULT_MODE);
  });

  it.each(A14_CONTRACT)("$label takes the $expectation branch", async ({ mode, expectation }) => {
    const { http, recorder } = await clickWith(mode);

    if (expectation === "error-and-no-request") {
      // Characterisation of the gap: nothing in the configuration says "sync", yet the synchronous
      // branch runs, the endpoint is called, and no message ever mentions the execution mode.
      expect(http.endpointPosts()).toHaveLength(1);
      expect(xrm.alerts).toEqual([SUCCESS_DIALOG]);
      expect(recorder.refreshes).toEqual([false]);
      return;
    }

    expect(http.endpointPosts()).toHaveLength(1);
    if (expectation === "async-action") {
      expect(xrm.alerts).toEqual([]);
      expect(recorder.refreshes).toEqual([]);
      return;
    }
    expect(xrm.alerts).toEqual([SUCCESS_DIALOG]);
    expect(recorder.refreshes).toEqual([false]);
  });

  it("a button whose advanced setting row does not exist stops by crashing, not by message", async () => {
    const http = installHttpStub({ advancedSetting: null, endpointAnswers: [OK_ANSWER] });

    await expect(ButtonRegistrationForm.onClick(buildFormContext(), BUTTON_NAME)).rejects.toBeInstanceOf(TypeError);

    // The request is never sent — but the user is told nothing, because an empty result set is silent in
    // the retrieval helper and the base case then dereferences the missing setting. A14's validator is
    // what turns this crash into the actionable message the rules require.
    expect(http.endpointPosts()).toHaveLength(0);
    expect(xrm.alerts).toEqual([]);
  });

  it("the grid sibling takes the synchronous branch for an out-of-set mode too", async () => {
    const http = installHttpStub({
      buttonSetting: buildButtonSetting({ esp_refreshwhenapicallends: true }),
      advancedSetting: modeSetting(NOT_A_MODE),
      endpointAnswers: [OK_ANSWER],
    });
    const gridControl = buildGridControl({ selectedRecordIds: [GRID_ROW_ID] });

    await ButtonRegistrationGrid.onClick(gridControl, BUTTON_NAME);
    await vi.advanceTimersByTimeAsync(0);

    expect(http.endpointPosts()).toHaveLength(1);
    expect(xrm.alerts).toEqual([SUCCESS_DIALOG]);
  });
});

describe("A14 contract fixture — integrity of the approved contract", () => {
  it("names one state per case: two valid modes, then cleared, absent and out-of-set", () => {
    expect(A14_CONTRACT.map((item) => item.expectation)).toEqual([
      "sync-action",
      "async-action",
      "error-and-no-request",
      "error-and-no-request",
      "error-and-no-request",
    ]);
  });

  it("sources valid values from the generated enum and invalid ones from documented states", () => {
    const valid = A14_CONTRACT.filter((item) => item.mode === ExecutionMode.Sync || item.mode === ExecutionMode.Async);
    expect(valid).toHaveLength(2);

    const invalid = A14_CONTRACT.filter((item) => item.expectation === "error-and-no-request");
    expect(invalid.map((item) => item.mode)).toEqual([null, undefined, NOT_A_MODE]);
  });

  it("requires zero requests from every invalid state", () => {
    for (const item of A14_CONTRACT.filter((entry) => entry.expectation === "error-and-no-request")) {
      expect(item.mode, item.label).not.toBe(ExecutionMode.Sync);
      expect(item.mode, item.label).not.toBe(ExecutionMode.Async);
    }
  });
});

describe("A14 source guard — choice values are compared to the enum, never to a typed-in integer", () => {
  it("both base cases compare the execution mode with an explicit === against the generated enum", () => {
    for (const [name, source] of baseCaseSources()) {
      expect(source, name).toMatch(/esp_executionmode\s*===\s*esp_[a-z_]+_esp_executionmode\.Async/);
    }
  });

  it("no choice value is ever compared against a raw number", () => {
    for (const [name, source] of baseCaseSources()) {
      expect(source, name).not.toMatch(/esp_executionmode\s*===\s*\d/);
      expect(source, name).not.toMatch(/esp_syncconfirmationboxtype\s*===\s*\d/);
      expect(source, name).not.toMatch(/esp_syncconfirmationboxredirectmode\s*===\s*\d/);
    }
  });

  it("the execution mode is the one choice branch with an else fallback — the shape A14 removes", () => {
    for (const [name, source] of baseCaseSources()) {
      const modeFallback = source.match(/esp_executionmode[\s\S]{0,220}?\}\s*else\s*\{/g) ?? [];
      expect(modeFallback, `${name} execution-mode fallbacks`).toHaveLength(1);

      const boxFallback = source.match(/esp_syncconfirmationboxtype[\s\S]{0,220}?\}\s*else\s*\{/g) ?? [];
      expect(boxFallback, `${name} confirmation-box fallbacks`).toHaveLength(0);
    }
  });
});

describe("SPECIFICATION — the A14 validator (skipped: no production validator exists yet)", () => {
  // Enable in the commit that adds the validator. Skipping keeps the contract executable-on-demand
  // without pretending the behaviour exists. When the NCB schema lands, only the enum import at the top
  // of this file changes; the contract table must not.
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.skip.each(A14_CONTRACT)("$label must produce $expectation", async ({ mode, expectation }) => {
    const { http, recorder } = await clickWith(mode);

    if (expectation === "error-and-no-request") {
      expect(http.endpointPosts()).toHaveLength(0);
      expect(recorder.refreshes).toEqual([]);
      expect(xrm.alerts).toHaveLength(1);
      // Rule 40: the message names the missing thing. The exact wording is still a product decision;
      // the contract is that the maker learns which button and which field are wrong.
      expect(xrm.alerts[0].text).toContain(BUTTON_NAME);
      expect(xrm.alerts[0].text).toMatch(/execution mode/i);
      return;
    }

    expect(http.endpointPosts()).toHaveLength(1);
    if (expectation === "async-action") {
      expect(xrm.alerts).toEqual([]);
      expect(recorder.refreshes).toEqual([]);
      return;
    }
    expect(xrm.alerts).toEqual([SUCCESS_DIALOG]);
    expect(recorder.refreshes).toEqual([false]);
  });
});

/** An advanced setting whose only interesting attribute is the execution mode under test. */
function modeSetting(mode: number | null | undefined): esp_ButtonAdvancedSetting {
  return buildAdvancedSetting({
    // The generated type says number; a cleared choice arrives from the Web API as null at runtime.
    esp_executionmode: mode as unknown as esp_ButtonAdvancedSetting["esp_executionmode"],
    esp_syncconfirmationboxtype: BoxType.Default,
    esp_syncconfirmationboxtitle: SUCCESS_DIALOG.title,
    esp_syncconfirmationboxtext: SUCCESS_DIALOG.text,
  });
}

/** Runs the real form click path for one execution-mode value and reports what the user saw. */
async function clickWith(mode: number | null | undefined): Promise<{ http: HttpSpy; recorder: FormRecorder }> {
  const recorder = createFormRecorder();
  const http = installHttpStub({
    buttonSetting: buildButtonSetting({ esp_refreshwhenapicallends: true }),
    advancedSetting: modeSetting(mode),
    endpointAnswers: [OK_ANSWER, OK_ANSWER],
  });

  await ButtonRegistrationForm.onClick(buildFormContext("account", undefined, recorder), BUTTON_NAME);
  // The async branch does not await its request; give the fire-and-forget promise its microtasks.
  await vi.advanceTimersByTimeAsync(0);
  return { http, recorder };
}

/** The two sibling base cases, read as text so a structural rule can be checked against both. */
function baseCaseSources(): Array<[string, string]> {
  return [
    ["form base case", sourceOf("src/Base_Cases/NoCodeButtonFormBase.ts")],
    ["grid base case", sourceOf("src/Base_Cases/NoCodeButtonGridBase.ts")],
  ];
}

function sourceOf(relativePath: string): string {
  const absolute = resolve(process.cwd(), relativePath);
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    throw new Error(`Cannot read ${absolute}; the source guard only runs from the repository root.`);
  }
}
