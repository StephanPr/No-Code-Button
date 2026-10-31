import { vi } from "vitest";
import type { esp_ButtonAdvancedSetting, esp_ButtonSetting } from "../../src/dataverse-gen";

/**
 * Test doubles for the runtime boundary only: the global `Xrm` object, `fetch`, and the
 * Dataverse records the button reads. Nothing here models button behaviour - the classes
 * under test stay real.
 */

export interface XrmSpy {
  openAlertDialog: (title: string, text: string) => string | undefined;
  alerts: Array<{ title: string; text: string }>;
  entityMetadataCalls: string[];
}

/** Installs a minimal `Xrm` global and returns the spies the assertions read. */
export function installXrmStub(languageId = 1033): XrmSpy {
  const alerts: Array<{ title: string; text: string }> = [];
  const entityMetadataCalls: string[] = [];

  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        userSettings: { languageId, userId: "{C2F4B618-AD23-7811-B023-9084732AB23F}" },
        getClientUrl: () => "https://contoso.crm.dynamics.com",
      }),
      getEntityMetadata: (entity: string) => {
        entityMetadataCalls.push(entity);
        // Explicit set: an assertion must never pass on a pluralisation the fake invented.
        const entitySets: Record<string, string> = { account: "accounts", contact: "contacts" };
        return Promise.resolve({ EntitySetName: entitySets[entity] });
      },
    },
    Navigation: {
      openAlertDialog: (strings: { title?: string; text: string }) => {
        alerts.push({ title: strings.title ?? "", text: strings.text });
        return Promise.resolve(null);
      },
      openConfirmDialog: () => Promise.resolve({ confirmed: true }),
    },
  };

  vi.stubGlobal("Xrm", xrm);

  return {
    alerts,
    entityMetadataCalls,
    openAlertDialog: (title, text) => {
      const found = alerts.find((alert) => alert.title === title && alert.text === text);
      return found?.text;
    },
  };
}

/** A form context whose record id and entity name are fixed and recognisable. */
export function buildFormContext(entityName = "account", recordId = "{B3E1A217-AD08-8191-9023-465306CA391B}") {
  const context = {
    data: {
      entity: {
        getEntityName: () => entityName,
        getId: () => recordId,
      },
    },
  };
  return context as unknown as Xrm.FormContext;
}

/** A grid control; `parent` makes it a subgrid, a selected row list drives the payload. */
export function buildGridControl(options: {
  entityName?: string;
  selectedRecordIds?: string[];
  parent?: unknown;
  parentFormContext?: Xrm.FormContext;
}) {
  const rows = (options.selectedRecordIds ?? []).map((id) => ({ data: { entity: { getId: () => id } } }));
  const gridControl = {
    getEntityName: () => options.entityName ?? "contact",
    getGrid: () => ({
      getSelectedRows: () => {
        const collection = rows.slice();
        return {
          forEach: (callback: (row: unknown) => void) => collection.forEach(callback),
          getLength: () => collection.length,
        };
      },
    }),
    getParent: () => options.parent ?? null,
    formContext: options.parentFormContext,
  };
  return gridControl as unknown as Xrm.Controls.GridControl;
}

export function buildButtonSetting(overrides: Partial<esp_ButtonSetting> = {}): esp_ButtonSetting {
  return {
    esp_buttonsettingid: "11111111-1111-1111-1111-111111111111",
    esp_buttonname: "MyButton",
    esp_endpoint: "https://prod-00.westeurope.logic.azure.com/workflows/00000000000000000000/request",
    esp_buttonlocation: 789620000,
    esp_includeentitylogicalnameinpayload: false,
    esp_includerecordidinpayload: false,
    esp_includecallinguseridinpayload: false,
    esp_savebeforerunning: true,
    esp_refreshwhenapicallends: false,
    ...overrides,
  } as unknown as esp_ButtonSetting;
}

export function buildAdvancedSetting(overrides: Partial<esp_ButtonAdvancedSetting> = {}): esp_ButtonAdvancedSetting {
  return {
    esp_buttonadvancedsettingid: "22222222-2222-2222-2222-222222222222",
    esp_executionmode: 789620000,
    esp_showconfirmationdialog: false,
    ...overrides,
  } as unknown as esp_ButtonAdvancedSetting;
}
