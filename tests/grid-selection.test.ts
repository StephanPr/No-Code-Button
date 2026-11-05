import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonRegistrationGrid } from "../src/Base_Cases/NoCodeButtonGridBase";
import { ButtonGridHelper } from "../src/Helpers/ButtonGridHelper";
import { buildAdvancedSetting, buildButtonSetting, buildGridControl, installXrmStub, type XrmSpy } from "./support/xrm-stub";

/**
 * The readme promises that a grid click with no selection raises the default exception and
 * sends no POST. Both halves of that promise are asserted here.
 */
describe("grid selection guard", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a grid with a selection", async () => {
    const helper = new ButtonGridHelper(buildGridControl({ selectedRecordIds: ["{E2A1B318-BF22-8819-A123-568930BD1234}"] }));

    await expect(helper.validateSelection()).resolves.toBeUndefined();
    expect(xrm.alerts).toHaveLength(0);
  });

  it("reports the missing selection to the user", async () => {
    const helper = new ButtonGridHelper(buildGridControl({ selectedRecordIds: [] }));

    await expect(helper.validateSelection()).rejects.toBeUndefined();
    await vi.waitFor(() => expect(xrm.alerts).toHaveLength(1));
    expect(xrm.alerts[0]).toEqual({
      title: "No Records selected",
      text: "No records selected. Please select at least one record.",
    });
  });

  it("posts nothing to the endpoint when nothing is selected", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => jsonResponse(url, init));
    vi.stubGlobal("fetch", fetchMock);
    const gridControl = buildGridControl({ selectedRecordIds: [] });

    await expect(ButtonRegistrationGrid.onClick(gridControl, "MyButton")).rejects.toBeUndefined();

    const posts = fetchMock.mock.calls.filter(([url, init]) => init?.method === "POST" && !url.includes("/api/data/"));
    expect(posts).toHaveLength(0);
  });
});

/** Canned Web API answers for the two configuration queries the button performs. */
function jsonResponse(url: string, init?: RequestInit): Promise<Response> {
  void init;
  const value = url.includes("esp_buttonadvancedsettings") ? [buildAdvancedSetting()] : [buildButtonSetting()];
  return Promise.resolve(new Response(JSON.stringify({ value }), { status: 200 }));
}
