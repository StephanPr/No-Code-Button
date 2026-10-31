import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseHelper } from "../src/Helpers/BaseHelper";
import { installXrmStub, buildFormContext, buildGridControl, type XrmSpy } from "./support/xrm-stub";

/**
 * Container detection is the first decision every click makes and the one the readme's
 * "use PrimaryControl for forms, SelectedControl for grids" warning exists to protect.
 */
describe("BaseHelper.getButtonLocation", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies a form context as a form and keeps the reference", () => {
    const helper = new BaseHelper();
    const formContext = buildFormContext();

    helper.getButtonLocation(formContext);

    expect(helper.containerType).toBe("form");
    expect(helper.formContext).toBe(formContext);
    expect(helper.gridControl).toBeUndefined();
  });

  it("classifies a standalone grid as a grid", () => {
    const helper = new BaseHelper();
    const gridControl = buildGridControl({ selectedRecordIds: [] });

    helper.getButtonLocation(gridControl);

    expect(helper.containerType).toBe("grid");
    expect(helper.gridControl).toBe(gridControl);
    expect(helper.formContext).toBeUndefined();
  });

  it("classifies a grid with a parent as a subgrid", () => {
    const helper = new BaseHelper();
    const gridControl = buildGridControl({ parent: {}, parentFormContext: buildFormContext("account") });

    helper.getButtonLocation(gridControl);

    expect(helper.containerType).toBe("subgrid");
  });

  it("leaves the container type unset when no context is passed", () => {
    const helper = new BaseHelper();

    helper.getButtonLocation();

    expect(helper.containerType).toBeUndefined();
  });

  it("reads the language and normalises the user id to a bare lowercase guid", () => {
    const helper = new BaseHelper();

    expect(helper.getLanguageCode()).toBe(1033);
    expect(helper.getUserID()).toBe("c2f4b618-ad23-7811-b023-9084732ab23f");
  });

  it("resolves the entity set name through the client metadata API", async () => {
    const helper = new BaseHelper();

    await expect(helper.getEntityPluralName("contact")).resolves.toBe("contacts");
    expect(xrm.entityMetadataCalls).toEqual(["contact"]);
  });

  it("sends the OData headers on every request and no body for a GET", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const helper = new BaseHelper();

    await helper.makeRequest("GET", "https://contoso.crm.dynamics.com/api/data/v9.1/esp_buttonsettings");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>)["OData-Version"]).toBe("4.0");
  });
});
