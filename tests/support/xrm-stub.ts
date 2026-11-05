/* eslint-disable camelcase */
import { vi } from "vitest";
import type { esp_ButtonAdvancedSetting, esp_ButtonSetting } from "../../src/dataverse-gen";

/**
 * Test doubles for the runtime boundary only: the global `Xrm` object, `fetch`, and the
 * Dataverse records the button reads. Nothing here models button behaviour - the classes
 * under test stay real.
 */

export interface XrmStubOptions {
  languageId?: number;
  /** Outcome every confirm dialog resolves with; the runtime reads `.confirmed`. */
  confirmed?: boolean;
  /**
   * What `Xrm.Navigation.openAlertDialog` resolves with. Learn documents no return value for the alert
   * dialog and `@types/xrm` types it `Async.PromiseLike<any>`; the runtime still reads `.confirmed`.
   * `"confirmed"` models the client the product is used with today, `"empty"` models the documented
   * contract of giving the caller nothing.
   */
  alertDialogResult?: "confirmed" | "empty";
}

export interface XrmSpy {
  openAlertDialog: (title: string, text: string) => string | undefined;
  alerts: Array<{ title: string; text: string }>;
  entityMetadataCalls: string[];
  /** Confirm dialogs the runtime opened, with the strings it passed. */
  confirmDialogs: Array<Partial<Xrm.Navigation.ConfirmStrings>>;
  /** App-level notifications added through `Xrm.App`, and the ids later cleared. */
  globalNotifications: Xrm.App.Notification[];
  clearedGlobalNotifications: string[];
  /** Progress-indicator lifecycle: the product rule is one open and one close per request. */
  spinner: { shown: string[]; closed: number };
  /** Every `window.open` the runtime performed, with the target it used. */
  openedWindows: Array<{ url: string; target: string }>;
}

/** Installs a minimal `Xrm` global and returns the spies the assertions read. */
export function installXrmStub(options: number | XrmStubOptions = {}): XrmSpy {
  const settings: XrmStubOptions = typeof options === "number" ? { languageId: options } : options;
  const languageId = settings.languageId ?? 1033;
  const confirmed = settings.confirmed ?? true;

  const alerts: Array<{ title: string; text: string }> = [];
  const entityMetadataCalls: string[] = [];
  const confirmDialogs: Array<Partial<Xrm.Navigation.ConfirmStrings>> = [];
  const globalNotifications: Xrm.App.Notification[] = [];
  const clearedGlobalNotifications: string[] = [];
  const spinner = { shown: [] as string[], closed: 0 };
  const openedWindows: Array<{ url: string; target: string }> = [];
  let notificationSeq = 0;

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
      showProgressIndicator: (message: string) => {
        spinner.shown.push(message);
      },
      closeProgressIndicator: () => {
        spinner.closed += 1;
      },
    },
    App: {
      addGlobalNotification: (notification: Xrm.App.Notification) => {
        globalNotifications.push(notification);
        notificationSeq += 1;
        return Promise.resolve(`notification-${notificationSeq}`);
      },
      clearGlobalNotification: (id: string) => {
        clearedGlobalNotifications.push(id);
        return Promise.resolve(true);
      },
    },
    Navigation: {
      openAlertDialog: (strings: { title?: string; text: string }) => {
        alerts.push({ title: strings.title ?? "", text: strings.text });
        return settings.alertDialogResult === "empty" ? Promise.resolve(null) : Promise.resolve({ confirmed });
      },
      openConfirmDialog: (strings?: Partial<Xrm.Navigation.ConfirmStrings>) => {
        confirmDialogs.push(strings ?? {});
        return Promise.resolve({ confirmed });
      },
    },
  };

  vi.stubGlobal("Xrm", xrm);
  // The client also exposes a global `XrmEnum`; Node provides none, so the fake supplies the members the
  // runtime touches. The integers below are **not** the client's real option values — no assertion may
  // depend on them (that is the D-14 lesson), only the strings the runtime passes are meaningful.
  vi.stubGlobal("XrmEnum", {
    AppNotificationLevel: { Critical: 0, Information: 1, Warning: 2 },
    FormNotificationLevel: { ERROR: "ERROR", INFO: "INFO", WARN: "WARN" },
    FormType: { Create: 1, Update: 2, ReadOnly: 3, Disabled: 4, BulkEdit: 5 },
  });
  vi.stubGlobal("window", {
    open: (url: string, target?: string) => {
      openedWindows.push({ url, target: target ?? "" });
      // The runtime calls `.focus()` on whatever `window.open` hands back.
      return { focus: () => undefined };
    },
  });

  return {
    alerts,
    confirmDialogs,
    globalNotifications,
    clearedGlobalNotifications,
    spinner,
    openedWindows,
    entityMetadataCalls,
    openAlertDialog: (title, text) => {
      const found = alerts.find((alert) => alert.title === title && alert.text === text);
      return found?.text;
    },
  };
}

/** Everything a spec needs to observe what the runtime did to a form. */
export interface FormRecorder {
  /** What `getIsDirty()` answers; the runtime saves only when this is true. */
  dirty: boolean;
  saves: number;
  /** One entry per `data.refresh()`, carrying the `preserveChanges` argument it received. */
  refreshes: boolean[];
  notifications: Array<{ message: string; level: string; id: string }>;
  clearedNotifications: string[];
}

export function createFormRecorder(dirty = false): FormRecorder {
  return { dirty, saves: 0, refreshes: [], notifications: [], clearedNotifications: [] };
}

/**
 * A form context whose record id and entity name are fixed and recognisable.
 *
 * @param entityName - Logical name `getEntityName()` reports.
 * @param recordId - Brace-wrapped id `getId()` reports, exactly as the client returns it.
 * @param recorder - Pass one to watch saves, refreshes and form notifications.
 * @returns The context, cast to the client type the helpers expect.
 */
export function buildFormContext(
  entityName = "account",
  recordId = "{B3E1A217-AD08-8191-9023-465306CA391B}",
  recorder: FormRecorder = createFormRecorder(),
): Xrm.FormContext {
  const context = {
    data: {
      entity: {
        getEntityName: () => entityName,
        getId: () => recordId,
        getIsDirty: () => recorder.dirty,
      },
      save: () => {
        recorder.saves += 1;
        return Promise.resolve();
      },
      refresh: (preserveChanges?: boolean) => {
        recorder.refreshes.push(Boolean(preserveChanges));
        return Promise.resolve();
      },
    },
    ui: {
      setFormNotification: (message: string, level: string, id: string) => {
        recorder.notifications.push({ message, level, id });
        return true;
      },
      clearFormNotification: (id: string) => {
        recorder.clearedNotifications.push(id);
        return true;
      },
    },
  };
  return context as unknown as Xrm.FormContext;
}

/** Counts the observable grid actions the runtime performs. */
export interface GridRecorder {
  refreshes: number;
}

/** A grid control; `parent` makes it a subgrid, a selected row list drives the payload. */
export function buildGridControl(options: {
  entityName?: string;
  selectedRecordIds?: string[];
  parent?: unknown;
  parentFormContext?: Xrm.FormContext;
  /** Pass one to count the `refresh()` calls the runtime makes after a request. */
  recorder?: GridRecorder;
}) {
  const recorder = options.recorder ?? { refreshes: 0 };
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
    // GridControl-level refresh: this is what ButtonGridHelper.reloadGrid() calls.
    refresh: () => {
      recorder.refreshes += 1;
    },
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
