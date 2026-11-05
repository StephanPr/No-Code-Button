/* eslint-disable camelcase */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseHelper } from "../src/Helpers/BaseHelper";
import { ButtonFormHelper } from "../src/Helpers/ButtonFormHelper";
import { ButtonGridHelper } from "../src/Helpers/ButtonGridHelper";
import { installHttpStub, type HttpSpy } from "./support/http";
import {
  buildAdvancedSetting,
  buildFormContext,
  buildGridControl,
  installXrmStub,
  type XrmSpy,
} from "./support/xrm-stub";
import {
  authoredConditionValue,
  fetchXmlOf,
  xmlAttributeViolations,
  type XmlAttributeViolation,
} from "./support/fetchxml";

/**
 * CHARACTERISATION of R-19 — how the runtime builds the FetchXML that looks a button up by name.
 *
 * These tests pin the behaviour that exists today; they are not an endorsement of it and they fix
 * nothing. R2's job is to make the current behaviour expensive to change by accident, so that the
 * eventual R-19 fix shows up as a deliberate, visible diff (ledger F-28).
 *
 * What is proven here: the document our own helper hands to `fetch`, read back out of the request URL.
 * What is deliberately **not** claimed: what a Dataverse Web API answers to such a request. This host
 * has no org, no credentials and no Windows, so "the query fails", "it returns 400" and "the server
 * tolerates it" would all be guesses. The ill-formedness asserted below is a property of the text we
 * author, independently confirmed on 2026-11-05 by round-tripping the same strings through a strict XML
 * parser (F-28); a real-org run is still owed for the server-side verdict.
 */

const GRID_ROW_ID = "{E2A1B318-BF22-8819-A123-568930BD1234}";

/** Names a maker can store as `esp_buttonname`, and what each one does to the document we author. */
const NAME_MATRIX: Array<{ label: string; name: string; violations: XmlAttributeViolation[] }> = [
  { label: "ampersand", name: "Save & Close", violations: ["unescaped-ampersand"] },
  { label: "double quote", name: 'He said "go"', violations: ["unescaped-quote"] },
  { label: "less-than", name: "<danger>", violations: ["unescaped-less-than"] },
  { label: "greater-than", name: "Close > All", violations: [] },
  {
    label: "all three at once",
    name: 'A & B "C" <D>',
    violations: ["unescaped-ampersand", "unescaped-quote", "unescaped-less-than"],
  },
  { label: "percent", name: "100% done", violations: [] },
  { label: "slash", name: "path/to/file", violations: [] },
  { label: "plus", name: "a+b", violations: [] },
  { label: "colon", name: "a:b", violations: [] },
  { label: "hash", name: "a#b", violations: [] },
  { label: "comma", name: "a,b", violations: [] },
  { label: "apostrophe", name: "it's", violations: [] },
  { label: "non-ASCII text", name: "Sauvegarder l'étiquette", violations: [] },
  { label: "already-escaped entity", name: "&amp;", violations: [] },
];

describe("R-19 characterisation: the button-name FetchXML condition", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(NAME_MATRIX)("$label", async ({ name, violations }) => {
    for (const [path, makeHelper] of paths()) {
      const fetchXml = await buttonNameQueryFor(makeHelper, name);
      // The template writes the maker's text straight into the attribute: nothing is escaped.
      expect(fetchXml, `${path} path sends the name verbatim`).toContain(`value="${name}"`);
      const parsed = authoredConditionValue(fetchXml, "esp_buttonname");
      expect(xmlAttributeViolations(parsed), `${path} path violations`).toEqual(violations);
    }
  });

  it("sends byte-identical condition text from the form and the grid path", async () => {
    const name = 'Report & export "now"';
    const form = await buttonNameQueryFor(formHelper, name);
    const grid = await buttonNameQueryFor(gridHelper, name);
    expect(grid).toBe(form);
  });

  it("keeps the URL well-formed while the document inside it is not", async () => {
    const http = installHttpStub();
    await formHelper().initializeSettings("Save & Close");

    const read = onlyButtonSettingRead(http);
    const query = read.url.slice(read.url.indexOf("?") + 1);
    // encodeURIComponent protects the URL structure, so no bare & ever reaches the query string.
    expect(query.includes("&")).toBe(false);
    expect(new URL(read.url).searchParams.get("fetchXml")).toContain('value="Save & Close"');
    const authored = authoredConditionValue(fetchXmlOf(read.url), "esp_buttonname");
    expect(xmlAttributeViolations(authored)).toEqual(["unescaped-ampersand"]);
  });

  it("looks up a pre-escaped name as that literal text, so it can never match the stored name", async () => {
    const fetchXml = await buttonNameQueryFor(formHelper, "&amp;");
    const authored = authoredConditionValue(fetchXml, "esp_buttonname");
    // Well-formed XML, but it searches for the five characters "&amp;" rather than for "&".
    expect(authored).toBe("&amp;");
    expect(xmlAttributeViolations(authored)).toEqual([]);
  });

  it("interpolates only a GUID and an LCID into the advanced-setting query", async () => {
    const http = installHttpStub();
    await formHelper().initializeSettings("MyButton");

    const fetchXml = advancedSettingQuery(http);
    expect(authoredConditionValue(fetchXml, "esp_mainbuttonsetting")).toBe("11111111-1111-1111-1111-111111111111");
    expect(authoredConditionValue(fetchXml, "esp_lcid")).toBe("1033");
    expect(xmlAttributeViolations(authoredConditionValue(fetchXml, "esp_mainbuttonsetting"))).toEqual([]);
    expect(xmlAttributeViolations(authoredConditionValue(fetchXml, "esp_lcid"))).toEqual([]);
  });

  it("resolves the language row by the current user's LCID, not by a stored default", async () => {
    installXrmStub({ languageId: 1041 });
    const http = installHttpStub();
    await formHelper().initializeSettings("MyButton");

    expect(authoredConditionValue(advancedSettingQuery(http), "esp_lcid")).toBe("1041");
  });

  it("stops after the first query and reports nothing when no button setting exists", async () => {
    const http = installHttpStub({ buttonSetting: null });
    const helper = formHelper();

    await helper.initializeSettings("NoSuchButton");

    // Characterisation, not intent: an empty result set is silent at this layer. The user only hears
    // about it when the base case dereferences the missing setting (pinned in the A14 file), and rule 45
    // requires "no rows" and "could not read" to stay distinguishable.
    expect(http.configReads()).toHaveLength(1);
    expect(http.endpointPosts()).toHaveLength(0);
    expect(xrm.alerts).toEqual([]);
    expect(helper.buttonSetting).toBeUndefined();
  });
});

describe("R-19 characterisation: the language lookup filter (settings form, not the click path)", () => {
  beforeEach(() => {
    installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("interpolates the language id from the record verbatim into the filter text", async () => {
    const row = { ...buildAdvancedSetting(), _esp_settinglanguage_value: "neffe & sons" };
    installHttpStub({ advancedSetting: row });

    const filter = await formHelper().getFilterLookupForLanguage("11111111-1111-1111-1111-111111111111", "1033");

    expect(filter).toBe(
      `<filter type='and'><condition attribute="esp_languageid" operator="ne" value="neffe & sons" /></filter>`,
    );
    expect(xmlAttributeViolations("neffe & sons")).toEqual(["unescaped-ampersand"]);
  });
});

describe("SPECIFICATION — what the R-19 fix must produce (skipped: R2 changes no behaviour)", () => {
  // Enable by removing `.skip` in the commit that fixes R-19. Until then these describe a contract the
  // code does not implement. The fix belongs in BaseHelper.getButtonSetting so that both click paths
  // inherit one change (rules 40/45); it also has to be checked in a real org that an escaped value
  // still matches the stored name, because it changes what the lookup asks for.
  beforeEach(() => {
    installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.skip("escapes the ampersand in the button-name condition", async () => {
    const fetchXml = await buttonNameQueryFor(formHelper, "Save & Close");
    expect(fetchXml).toContain('value="Save &amp; Close"');
  });

  it.skip("escapes quotes and angle brackets in the button-name condition", async () => {
    const fetchXml = await buttonNameQueryFor(formHelper, 'A & B "C" <D>');
    expect(fetchXml).toContain('value="A &amp; B &quot;C&quot; &lt;D&gt;" />');
  });

  it.skip("escapes identically on the grid path, because one seam serves both", async () => {
    const form = await buttonNameQueryFor(formHelper, "Save & Close");
    const grid = await buttonNameQueryFor(gridHelper, "Save & Close");
    expect(grid).toBe(form);
    expect(grid).toContain('value="Save &amp; Close"');
  });
});

/** The two click paths that reach the same retrieval seam. */
function paths(): Array<[string, () => BaseHelper]> {
  return [
    ["form", formHelper],
    ["grid", gridHelper],
  ];
}

function formHelper(): BaseHelper {
  return new ButtonFormHelper(buildFormContext());
}

function gridHelper(): BaseHelper {
  return new ButtonGridHelper(buildGridControl({ selectedRecordIds: [GRID_ROW_ID] }));
}

/** Runs the real seam for one helper and returns the decoded FetchXML it sent for the button lookup. */
async function buttonNameQueryFor(makeHelper: () => BaseHelper, name: string): Promise<string> {
  const http = installHttpStub();
  await makeHelper().initializeSettings(name);
  return fetchXmlOf(onlyButtonSettingRead(http).url);
}

function onlyButtonSettingRead(http: HttpSpy): { url: string } {
  const reads = http.configReads().filter((call) => call.url.includes("/esp_buttonsettings"));
  if (reads.length !== 1) {
    throw new Error(`Expected exactly one esp_buttonsettings read, got ${reads.length}.`);
  }
  return reads[0];
}

function advancedSettingQuery(http: HttpSpy): string {
  const read = http.configReads().find((call) => call.url.includes("/esp_buttonadvancedsettings"));
  if (!read) {
    throw new Error("The runtime sent no query against esp_buttonadvancedsettings.");
  }
  return fetchXmlOf(read.url);
}
