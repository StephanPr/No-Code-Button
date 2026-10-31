import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esp_buttonsetting_esp_buttonsetting_esp_buttonlocation } from "../src/dataverse-gen";
import { ButtonFormHelper } from "../src/Helpers/ButtonFormHelper";
import { ButtonGridHelper } from "../src/Helpers/ButtonGridHelper";
import { buildButtonSetting, buildFormContext, buildGridControl, installXrmStub } from "./support/xrm-stub";

/**
 * The payload is the published contract with every customer's Power Automate trigger, so
 * key names and key presence are asserted exactly - never with a superset match.
 */
describe("payload contract", () => {
  beforeEach(() => {
    installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("form button", () => {
    it("is empty when no include flag is set", async () => {
      const helper = new ButtonFormHelper(buildFormContext());
      helper.buttonSetting = buildButtonSetting();

      await expect(helper.getPayload()).resolves.toEqual({});
    });

    it("carries the singular and plural logical name of the record", async () => {
      const helper = new ButtonFormHelper(buildFormContext("account"));
      helper.buttonSetting = buildButtonSetting({ esp_includeentitylogicalnameinpayload: true });

      await expect(helper.getPayload()).resolves.toEqual({
        entityLogicalSingularName: "account",
        entityLogicalPluralName: "accounts",
      });
    });

    it("strips the braces from the record id", async () => {
      const helper = new ButtonFormHelper(buildFormContext("account", "{B3E1A217-AD08-8191-9023-465306CA391B}"));
      helper.buttonSetting = buildButtonSetting({ esp_includerecordidinpayload: true });

      await expect(helper.getPayload()).resolves.toEqual({ recordId: "b3e1a217-ad08-8191-9023-465306ca391b" });
    });

    it("matches the documented full payload", async () => {
      const helper = new ButtonFormHelper(buildFormContext("account"));
      helper.buttonSetting = buildButtonSetting({
        esp_includeentitylogicalnameinpayload: true,
        esp_includerecordidinpayload: true,
        esp_includecallinguseridinpayload: true,
      });

      await expect(helper.getPayload()).resolves.toEqual({
        entityLogicalSingularName: "account",
        entityLogicalPluralName: "accounts",
        recordId: "b3e1a217-ad08-8191-9023-465306ca391b",
        userId: "c2f4b618-ad23-7811-b023-9084732ab23f",
      });
    });
  });

  describe("grid button", () => {
    it("sends every selected record id", async () => {
      const gridControl = buildGridControl({
        entityName: "contact",
        selectedRecordIds: ["{E2A1B318-BF22-8819-A123-568930BD1234}", "{D2A1C417-BC22-7719-B134-468940BE5678}"],
      });
      const helper = new ButtonGridHelper(gridControl);
      helper.buttonSetting = buildButtonSetting({
        esp_buttonlocation: esp_buttonsetting_esp_buttonsetting_esp_buttonlocation.Grid,
        esp_includeentitylogicalnameinpayload: true,
        esp_includerecordidinpayload: true,
        esp_includecallinguseridinpayload: true,
      });

      await expect(helper.getPayload()).resolves.toEqual({
        entityLogicalName: "contact",
        entityLogicalPluralName: "contacts",
        recordIds: ["e2a1b318-bf22-8819-a123-568930bd1234", "d2a1c417-bc22-7719-b134-468940be5678"],
        userId: "c2f4b618-ad23-7811-b023-9084732ab23f",
      });
    });

    it("adds no parent keys for a standalone grid", async () => {
      const helper = new ButtonGridHelper(buildGridControl({ entityName: "contact", selectedRecordIds: [] }));
      helper.buttonSetting = buildButtonSetting({
        esp_buttonlocation: esp_buttonsetting_esp_buttonsetting_esp_buttonlocation.Grid,
        esp_includeentitylogicalnameinpayload: true,
        esp_includerecordidinpayload: true,
      });

      const payload = await helper.getPayload();

      expect(Object.keys(payload).sort()).toEqual(["entityLogicalName", "entityLogicalPluralName", "recordIds"]);
    });
  });

  describe("subgrid button", () => {
    it("adds the parent entity and record of the hosting form", async () => {
      const gridControl = buildGridControl({
        entityName: "contact",
        selectedRecordIds: ["{F4E1D217-CD08-7191-D123-578406CA123C}"],
        parent: {},
        parentFormContext: buildFormContext("account", "{B3E1A217-AD08-8191-9023-465306CA391B}"),
      });
      const helper = new ButtonGridHelper(gridControl);
      helper.buttonSetting = buildButtonSetting({
        esp_buttonlocation: esp_buttonsetting_esp_buttonsetting_esp_buttonlocation.Subgrid,
        esp_includeentitylogicalnameinpayload: true,
        esp_includerecordidinpayload: true,
        esp_includecallinguseridinpayload: true,
      });

      await expect(helper.getPayload()).resolves.toEqual({
        entityLogicalName: "contact",
        entityLogicalPluralName: "contacts",
        parentEntityLogicalName: "account",
        parentEntityLogicalPluralName: "accounts",
        parentRecordId: "b3e1a217-ad08-8191-9023-465306ca391b",
        recordIds: ["f4e1d217-cd08-7191-d123-578406ca123c"],
        userId: "c2f4b618-ad23-7811-b023-9084732ab23f",
      });
    });

    it("omits the parent keys when the setting says grid but the control is a subgrid", async () => {
      const gridControl = buildGridControl({
        entityName: "contact",
        selectedRecordIds: [],
        parent: {},
        parentFormContext: buildFormContext("account"),
      });
      const helper = new ButtonGridHelper(gridControl);
      helper.buttonSetting = buildButtonSetting({
        esp_buttonlocation: esp_buttonsetting_esp_buttonsetting_esp_buttonlocation.Grid,
        esp_includeentitylogicalnameinpayload: true,
      });

      const payload = await helper.getPayload();

      expect(payload).not.toHaveProperty("parentEntityLogicalName");
      expect(payload).not.toHaveProperty("parentRecordId");
    });
  });

  it("refuses to build a payload without a button setting", async () => {
    const helper = new ButtonGridHelper(buildGridControl({ selectedRecordIds: [] }));

    await expect(helper.getPayload()).rejects.toThrow("Grid control or button setting is not set.");
  });
});

