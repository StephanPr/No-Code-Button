/* eslint-disable camelcase */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonRegistrationForm } from "../src/Base_Cases/NoCodeButtonFormBase";
import { ButtonRegistrationGrid } from "../src/Base_Cases/NoCodeButtonGridBase";
import { ButtonFormHelper } from "../src/Helpers/ButtonFormHelper";
import { ButtonGridHelper } from "../src/Helpers/ButtonGridHelper";
import {
  esp_buttonadvancedsetting_esp_buttonadvancedsetting_esp_executionmode as ExecutionMode,
  esp_buttonadvancedsetting_esp_buttonadvancedsetting_esp_syncconfirmationboxredirectmode as RedirectMode,
  esp_buttonadvancedsetting_esp_buttonadvancedsetting_esp_syncconfirmationboxtype as BoxType,
} from "../src/dataverse-gen";
import type { esp_ButtonAdvancedSetting, esp_ButtonSetting } from "../src/dataverse-gen";
import { installHttpStub, type EndpointAnswer, type EndpointFailure, type HttpSpy } from "./support/http";
import {
  buildAdvancedSetting,
  buildButtonSetting,
  buildFormContext,
  buildGridControl,
  createFormRecorder,
  installXrmStub,
  type FormRecorder,
  type GridRecorder,
  type XrmSpy,
} from "./support/xrm-stub";

/**
 * CHARACTERISATION of the synchronous response path — what the user sees for each answer the endpoint
 * gives, on both the form and the grid sibling.
 *
 * Like the R-19 file, this pins behaviour as it is today and changes none of it. Where the code is
 * silent, the test asserts the silence, because that silence is the current contract a customer can
 * observe and the thing a future fix must deliberately break. Status handling lives only in the two base
 * cases (rule 40), and the two are asserted side by side so a future change to one cannot drift from the
 * other unnoticed.
 *
 * Proven here: which dialog, notification, spinner teardown, refresh or `window.open` the code performs
 * for a canned `Response`. Not proven here: that a real Power Automate flow returns that status, or that
 * the dialog renders where a human would see it — that needs a browser and an org.
 */

const GRID_ROW_ID = "{E2A1B318-BF22-8819-A123-568930BD1234}";
const NOTIFICATION_ID = "NoCodeButtonFormNotification";
const REPORT_URI = "https://reporting.example.com/quarterly";

/**
 * The statuses that fall outside the three documented branches (400, >=500, 200).
 *
 * 204/205/304 are deliberately absent: this Node runtime refuses to construct a `Response` carrying a
 * null-body status, so they cannot be handed to the code honestly here. A real client can answer 204, so
 * that corner stays on the manual-org list rather than being claimed as covered.
 */
const UNHANDLED_STATUSES = [201, 202, 302, 401, 403, 404, 429];

function answer(status: number, body?: string): EndpointAnswer {
  return { status, body };
}

function httpWith(...answers: Array<EndpointAnswer | EndpointFailure>): HttpSpy {
  return installHttpStub({ endpointAnswers: answers });
}

/** A form helper with settings already loaded, so the test controls only what it asserts on. */
function formFixture(
  advanced: Partial<esp_ButtonAdvancedSetting> = {},
  setting: Partial<esp_ButtonSetting> = {},
): { helper: ButtonFormHelper; recorder: FormRecorder } {
  const recorder = createFormRecorder();
  const helper = new ButtonFormHelper(buildFormContext("account", undefined, recorder));
  helper.buttonSetting = buildButtonSetting({ esp_refreshwhenapicallends: true, ...setting });
  helper.buttonAdvancedSetting = buildAdvancedSetting({
    esp_executionmode: ExecutionMode.Sync,
    esp_syncconfirmationboxtype: BoxType.Default,
    esp_syncconfirmationboxtitle: "Done",
    esp_syncconfirmationboxtext: "The action finished.",
    ...advanced,
  });
  return { helper, recorder };
}

/** The grid sibling of {@link formFixture}. */
function gridFixture(
  advanced: Partial<esp_ButtonAdvancedSetting> = {},
  setting: Partial<esp_ButtonSetting> = {},
): { helper: ButtonGridHelper; recorder: GridRecorder } {
  const recorder = { refreshes: 0 };
  const helper = new ButtonGridHelper(buildGridControl({ selectedRecordIds: [GRID_ROW_ID], recorder }));
  helper.buttonSetting = buildButtonSetting({ esp_refreshwhenapicallends: true, ...setting });
  helper.buttonAdvancedSetting = buildAdvancedSetting({
    esp_executionmode: ExecutionMode.Sync,
    esp_syncconfirmationboxtype: BoxType.Default,
    esp_syncconfirmationboxtitle: "Done",
    esp_syncconfirmationboxtext: "The action finished.",
    ...advanced,
  });
  return { helper, recorder };
}

describe("synchronous response handling — form path", () => {
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

  it("sends exactly one POST, to the configured endpoint, carrying the configured payload", async () => {
    const { helper } = formFixture();
    const http = httpWith(answer(200));

    await ButtonRegistrationForm.executeSync(helper);

    expect(http.endpointPosts()).toEqual([{ method: "POST", url: helper.buttonSetting!.esp_endpoint, body: {} }]);
    expect(http.endpointPosts()).toHaveLength(1);
  });

  it("200 shows the configured success dialog and refreshes the form once", async () => {
    const { helper, recorder } = formFixture();
    httpWith(answer(200));

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "Done", text: "The action finished." }]);
    expect(recorder.refreshes).toEqual([false]);
    expect(xrm.openedWindows).toEqual([]);
  });

  it("200 replaces the running notification with the success notification", async () => {
    const { helper, recorder } = formFixture({
      esp_syncformnotification: true,
      esp_syncformnotificationtext: "Working on it",
      esp_syncsuccessformnotification: true,
      esp_syncsuccessformnotificationtext: "All done",
    });
    httpWith(answer(200));

    await ButtonRegistrationForm.executeSync(helper);

    expect(recorder.notifications).toEqual([
      { message: "Working on it", level: "INFO", id: NOTIFICATION_ID },
      { message: "All done", level: "INFO", id: NOTIFICATION_ID },
    ]);
    expect(recorder.clearedNotifications).toEqual([NOTIFICATION_ID]);
  });

  it("opens the spinner once and closes it once even when the request never resolves", async () => {
    const { helper, recorder } = formFixture({
      esp_syncspinner: true,
      esp_syncspinnertext: "Hold on",
    });
    httpWith({ rejectWith: new TypeError("Failed to fetch") });

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "Error during HTTP Call", text: "Failed to fetch" }]);
    expect(xrm.spinner).toEqual({ shown: ["Hold on"], closed: 1 });
    expect(recorder.refreshes).toEqual([]);
  });

  it("stops before the request when the spinner text is empty", async () => {
    const { helper } = formFixture({ esp_syncspinner: true });
    const http = httpWith();

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toEqual([
      {
        title: "Sync Spinner Text Error",
        text: "The sync spinner text is empty! Please fill it on your configuration settings.",
      },
    ]);
    expect(http.endpointPosts()).toHaveLength(0);
    expect(xrm.spinner).toEqual({ shown: [], closed: 0 });
  });

  it("400 shows the title and message the flow supplied", async () => {
    const { helper, recorder } = formFixture();
    httpWith(answer(400, JSON.stringify({ title: "Not allowed", message: "Stage 2 failed" })));

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "Not allowed", text: "Stage 2 failed" }]);
    expect(recorder.refreshes).toEqual([]);
  });

  it("400 without a title shows an empty title rather than a default one", async () => {
    const { helper } = formFixture();
    httpWith(answer(400, JSON.stringify({ message: "Boom" })));

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "", text: "Boom" }]);
  });

  it("400 with a body that is not JSON rejects and tells the user nothing", async () => {
    const { helper, recorder } = formFixture();
    httpWith(answer(400, "<html><body>Gateway Timeout</body></html>"));

    await expect(ButtonRegistrationForm.executeSync(helper)).rejects.toBeInstanceOf(SyntaxError);

    // Characterisation of a real gap: the flow's text is discarded and the ribbon swallows the
    // rejection, so the user is left with no dialog at all after a failed button click.
    expect(xrm.alerts).toEqual([]);
    expect(recorder.refreshes).toEqual([]);
  });

  it("5xx reports the status code and the raw body text", async () => {
    const { helper, recorder } = formFixture();
    httpWith(answer(503, "flow throttled"));

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "Error during HTTP Call", text: "Error code: 503\nflow throttled" }]);
    expect(recorder.refreshes).toEqual([]);
  });

  it("5xx with an empty body reports only the code; the hard-coded fallback text is unreachable", async () => {
    const { helper } = formFixture();
    httpWith(answer(500));

    await ButtonRegistrationForm.executeSync(helper);

    // `response.text()` resolves to "" rather than null, so the "An error occurred on the server."
    // literal in the base case can never be shown. Pinned so a future message change is a decision.
    expect(xrm.alerts).toEqual([{ title: "Error during HTTP Call", text: "Error code: 500\n" }]);
  });

  it("200 with the redirect box type opens the URI from the body in a new tab", async () => {
    const { helper, recorder } = formFixture({
      esp_syncconfirmationboxtype: BoxType.Redirect,
      esp_syncconfirmationboxredirecttitle: "Report",
      esp_syncconfirmationboxredirecttext: "Open the report?",
      esp_syncconfirmationboxredirectmode: RedirectMode.NewTab,
    });
    httpWith(answer(200, JSON.stringify({ redirectUri: REPORT_URI })));

    await ButtonRegistrationForm.executeSync(helper);
    await vi.advanceTimersByTimeAsync(0);

    expect(xrm.confirmDialogs).toHaveLength(1);
    expect(xrm.openedWindows).toEqual([{ url: REPORT_URI, target: "_blank" }]);
    expect(recorder.refreshes).toEqual([false]);
  });

  it("200 with the current-tab redirect mode still refreshes, because the guard reads another field", async () => {
    const { helper, recorder } = formFixture({
      esp_syncconfirmationboxtype: BoxType.Redirect,
      esp_syncconfirmationboxredirecttext: "Open the report?",
      esp_syncconfirmationboxredirectmode: RedirectMode.CurrentTab,
    });
    httpWith(answer(200, JSON.stringify({ redirectUri: REPORT_URI })));

    await ButtonRegistrationForm.executeSync(helper);
    await vi.advanceTimersByTimeAsync(0);

    // reloadForm() suppresses the refresh only when esp_syncconfirmationboxredirect is set — a field
    // the click path never reads — so the form refreshes underneath a same-tab navigation.
    expect(xrm.openedWindows).toEqual([{ url: REPORT_URI, target: "_self" }]);
    expect(recorder.refreshes).toEqual([false]);
  });

  it("200 whose body has no redirectUri alerts, stops before opening anything, and rejects", async () => {
    const { helper, recorder } = formFixture({
      esp_syncconfirmationboxtype: BoxType.Redirect,
      esp_syncconfirmationboxredirecttext: "Open the report?",
    });
    httpWith(answer(200, JSON.stringify({ message: "all good" })));

    await expect(ButtonRegistrationForm.executeSync(helper)).rejects.toThrow(
      "Invalid JSON format for RedirectResponse",
    );

    expect(xrm.alerts).toEqual([
      { title: "Redirect URI Not Found", text: "The redirect URI was not found in the response." },
    ]);
    expect(xrm.openedWindows).toEqual([]);
    expect(recorder.refreshes).toEqual([]);
  });

  it("200 success dialog: a client that gives openAlertDialog no value breaks the path after the POST ran", async () => {
    // Verified against primary sources on 2026-11-05: Learn documents no return value for
    // openAlertDialog, and @types/xrm types it Async.PromiseLike<any>. The runtime reads `.confirmed`
    // off it anyway, so a client honouring the documented contract turns a successful call into a
    // rejection that never reaches reloadForm(). The dialog itself was already shown.
    xrm = installXrmStub({ alertDialogResult: "empty" });
    const { helper, recorder } = formFixture();
    const http = httpWith(answer(200));

    await expect(ButtonRegistrationForm.executeSync(helper)).rejects.toBeInstanceOf(TypeError);

    expect(http.endpointPosts()).toHaveLength(1);
    expect(xrm.alerts).toHaveLength(1);
    expect(recorder.refreshes).toEqual([]);
  });
});

describe("synchronous response handling — grid path", () => {
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

  it("200 shows the same success dialog as the form path and refreshes the grid once", async () => {
    const { helper, recorder } = gridFixture();
    httpWith(answer(200));

    await ButtonRegistrationGrid.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "Done", text: "The action finished." }]);
    expect(recorder.refreshes).toBe(1);
  });

  it("400 shows the flow's own title and message", async () => {
    const { helper, recorder } = gridFixture();
    httpWith(answer(400, JSON.stringify({ title: "Not allowed", message: "Stage 2 failed" })));

    await ButtonRegistrationGrid.executeSync(helper);

    expect(xrm.alerts).toEqual([{ title: "Not allowed", text: "Stage 2 failed" }]);
    expect(recorder.refreshes).toBe(0);
  });

  it("the running global notification carries the configured text", async () => {
    const { helper } = gridFixture({
      esp_syncformnotification: true,
      esp_syncformnotificationtext: "Working on it",
    });
    httpWith(answer(200));

    await ButtonRegistrationGrid.executeSync(helper);

    expect(xrm.globalNotifications.map((notification) => notification.message)).toEqual(["Working on it"]);
  });
});

describe("synchronous response handling — statuses outside the three documented branches", () => {
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

  it.each(UNHANDLED_STATUSES)("%i answer sends the request and then does nothing on either path", async (status) => {
    const form = formFixture();
    const grid = gridFixture();
    const explanation = "the server explained itself";
    const http = httpWith(answer(status, explanation), answer(status, explanation));

    await ButtonRegistrationForm.executeSync(form.helper);
    await ButtonRegistrationGrid.executeSync(grid.helper);

    // Characterisation: the POST went out, the answer was ignored, and the user was told nothing.
    expect(http.endpointPosts()).toHaveLength(2);
    expect(xrm.alerts).toEqual([]);
    expect(xrm.openedWindows).toEqual([]);
    expect(form.recorder.refreshes).toEqual([]);
    expect(grid.recorder.refreshes).toBe(0);
  });
});

describe("synchronous response handling — notification teardown, where the siblings differ", () => {
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

  it("the form clears its notification only because the spinner flag is on", async () => {
    const withSpinner = formFixture({
      esp_syncformnotification: true,
      esp_syncformnotificationtext: "Working on it",
      esp_syncspinner: true,
      esp_syncspinnertext: "Hold on",
    });
    const withoutSpinner = formFixture({
      esp_syncformnotification: true,
      esp_syncformnotificationtext: "Working on it",
    });
    httpWith(answer(404, "gone"), answer(404, "gone"));

    await ButtonRegistrationForm.executeSync(withSpinner.helper);
    await ButtonRegistrationForm.executeSync(withoutSpinner.helper);

    // Both requests finished; only the first run cleared. The form's finally-block teardown is coupled
    // to esp_syncspinner, so a notification-only button leaves its banner until the 120 s timer expires.
    expect(withSpinner.recorder.clearedNotifications).toEqual([NOTIFICATION_ID]);
    expect(withoutSpinner.recorder.clearedNotifications).toEqual([]);
    expect(withoutSpinner.recorder.notifications).toHaveLength(1);
  });

  it("the grid clears its global notification from its own flag, whatever the status", async () => {
    const grid = gridFixture({
      esp_syncformnotification: true,
      esp_syncformnotificationtext: "Working on it",
    });
    httpWith(answer(404, "gone"));

    await ButtonRegistrationGrid.executeSync(grid.helper);
    await vi.advanceTimersByTimeAsync(0);

    expect(xrm.globalNotifications).toHaveLength(1);
    expect(xrm.clearedGlobalNotifications).toEqual(["notification-1"]);
  });
});

describe("asynchronous response handling — fire and forget stays fire and forget", () => {
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

  it("a 500 answer is never read: no dialog, no refresh, one request sent", async () => {
    const { helper, recorder } = formFixture({ esp_executionmode: ExecutionMode.Async });
    const http = httpWith(answer(500, JSON.stringify({ title: "Bad", message: "Server exploded" })));

    await ButtonRegistrationForm.executeAsync(helper);
    await vi.advanceTimersByTimeAsync(0);

    expect(http.endpointPosts()).toHaveLength(1);
    expect(xrm.alerts).toEqual([]);
    expect(recorder.refreshes).toEqual([]);
  });

  it("only a request that never left the browser is reported, and it clears the banner", async () => {
    const { helper, recorder } = formFixture({
      esp_executionmode: ExecutionMode.Async,
      esp_asyncformnotification: true,
      esp_asyncformnotificationtext: "Sent",
    });
    httpWith({ rejectWith: new TypeError("NetworkError when attempting to fetch resource.") });

    await ButtonRegistrationForm.executeAsync(helper);
    await vi.advanceTimersByTimeAsync(0);

    expect(xrm.alerts).toEqual([
      { title: "Error during HTTP Call", text: "NetworkError when attempting to fetch resource." },
    ]);
    expect(recorder.notifications).toEqual([{ message: "Sent", level: "INFO", id: NOTIFICATION_ID }]);
    expect(recorder.clearedNotifications).toEqual([NOTIFICATION_ID]);
  });
});

describe("SPECIFICATION — response gaps to close (skipped: R2 changes no behaviour)", () => {
  // Enable in the commit that fixes them. The assertions deliberately check that a message exists and
  // that it names the status, not its wording — the wording is a product decision not yet made.
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

  it.skip("a 403 answer tells the user they are not allowed", async () => {
    const { helper } = formFixture();
    httpWith(answer(403, "insufficient privileges"));

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toHaveLength(1);
    expect(xrm.alerts[0].text).toContain("403");
  });

  it.skip("a 400 whose body is not JSON still surfaces the raw text", async () => {
    const { helper } = formFixture();
    httpWith(answer(400, "<html><body>Gateway Timeout</body></html>"));

    await expect(ButtonRegistrationForm.executeSync(helper)).resolves.toBeUndefined();

    expect(xrm.alerts).toHaveLength(1);
    expect(xrm.alerts[0].text).toContain("Gateway Timeout");
  });

  it.skip("every status outside 200, 400 and 5xx is a documented outcome, never silence", async () => {
    const { helper } = formFixture();
    httpWith(answer(404, "gone"));

    await ButtonRegistrationForm.executeSync(helper);

    expect(xrm.alerts).toHaveLength(1);
  });
});
