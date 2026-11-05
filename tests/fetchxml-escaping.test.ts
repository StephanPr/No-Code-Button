/* eslint-disable camelcase */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseHelper } from "../src/Helpers/BaseHelper";
import { ButtonFormHelper } from "../src/Helpers/ButtonFormHelper";
import { ButtonGridHelper } from "../src/Helpers/ButtonGridHelper";
import { FetchXmlEscape } from "../src/Helpers/FetchXmlEscape";
import { installHttpStub, type HttpSpy } from "./support/http";
import {
  buildAdvancedSetting,
  buildFormContext,
  buildGridControl,
  installXrmStub,
  type XrmSpy,
} from "./support/xrm-stub";
import { findElements, parseXmlDocument, type XmlElement, XmlParseError } from "./support/xml";
import { fetchXmlOf, unescapeXmlAttribute } from "./support/fetchxml";

/**
 * R-19 is **fixed** (work unit R2.1): every FetchXML the runtime builds escapes the text it interpolates,
 * so a maker's button name can contain markup characters without corrupting the query, and without the
 * name itself ever being changed. This file used to pin the opposite behaviour as a defect; the
 * expectations below are the corrected contract, and the three specifications that had to stay skipped
 * while the defect stood are now enabled.
 *
 * The pre-fix record is not deleted. It lives in the private register: F-28 (the strict-parser
 * reproduction of the ill-formed query), F-35 (the silent behaviours that remain, one of which is still
 * characterised at the bottom of this file) and E-38 (the mutation proof that this file notices a change).
 *
 * Boundary, unchanged: this file proves the document our own code hands to `fetch`, read back out of the
 * request URL and through a strict XML reader. What a Dataverse Web API answers to that document — in
 * particular whether an escaped value still matches the stored name — cannot be observed from this host
 * and is asserted nowhere here; it is on the manual-org list.
 */

const GRID_ROW_ID = "{E2A1B318-BF22-8819-A123-568930BD1234}";

/** Names a maker can store as `esp_buttonname`, and the only XML representation that selects them. */
const ESCAPE_MATRIX: Array<{ label: string; name: string; escaped: string }> = [
  { label: "ampersand", name: "Save & Close", escaped: "Save &amp; Close" },
  { label: "double quote", name: 'He said "go"', escaped: "He said &quot;go&quot;" },
  { label: "less-than", name: "<danger>", escaped: "&lt;danger&gt;" },
  { label: "greater-than", name: "Close > All", escaped: "Close &gt; All" },
  { label: "apostrophe", name: "it's", escaped: "it&apos;s" },
  {
    label: "all five markup characters at once",
    name: `A & B "C" <D> 'e'`,
    escaped: "A &amp; B &quot;C&quot; &lt;D&gt; &apos;e&apos;",
  },
  { label: "entity-like ampersand already in the name", name: "&amp;", escaped: "&amp;amp;" },
  { label: "entity-like angle brackets in the name", name: "&lt;tag&gt;", escaped: "&amp;lt;tag&amp;gt;" },
  { label: "percent", name: "100% done", escaped: "100% done" },
  { label: "slashes and backslash", name: "path/to\\file", escaped: "path/to\\file" },
  { label: "plus, which URL encoding alone would corrupt", name: "a+b", escaped: "a+b" },
  { label: "ordinary punctuation", name: "a:b#c,d-e_f", escaped: "a:b#c,d-e_f" },
  { label: "non-ASCII with an apostrophe", name: "Sauvegarder l'étiquette", escaped: "Sauvegarder l&apos;étiquette" },
  { label: "CJK and emoji", name: "ボタン 🚀", escaped: "ボタン 🚀" },
  { label: "leading and trailing spaces", name: "  Padded  ", escaped: "  Padded  " },
  { label: "mixed case", name: "Cancel ALL", escaped: "Cancel ALL" },
  {
    label: "markup that must stay inert data",
    name: `"><script>alert(1)</script>`,
    escaped: "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
  },
  { label: "empty name", name: "", escaped: "" },
];

describe("FetchXmlEscape.escapeAttributeValue — the utility itself", () => {
  it("returns text that needs nothing byte-identical", () => {
    const plain = "Save now 100% / a+b : c,d #e «é» ボタン 🚀";
    expect(FetchXmlEscape.escapeAttributeValue(plain)).toBe(plain);
  });

  it("replaces the ampersand first, so a name that already looks like an entity stays data", () => {
    expect(FetchXmlEscape.escapeAttributeValue("&amp;")).toBe("&amp;amp;");
    expect(FetchXmlEscape.escapeAttributeValue("&lt;tag&gt;")).toBe("&amp;lt;tag&amp;gt;");
  });

  it("escapes every character that is markup inside an attribute value", () => {
    expect(FetchXmlEscape.escapeAttributeValue(`& " < > '`)).toBe("&amp; &quot; &lt; &gt; &apos;");
  });

  it("never trims, recases or normalises the customer's name", () => {
    expect(FetchXmlEscape.escapeAttributeValue("  Keep CASE's  ")).toBe("  Keep CASE&apos;s  ");
  });

  it("is not idempotent, which is why it belongs at the query boundary and runs once", () => {
    const once = FetchXmlEscape.escapeAttributeValue("A & B");
    expect(once).toBe("A &amp; B");
    expect(FetchXmlEscape.escapeAttributeValue(once)).toBe("A &amp;amp; B");
  });

  it("handles an empty name without inventing one", () => {
    expect(FetchXmlEscape.escapeAttributeValue("")).toBe("");
  });
});

describe("The XML reader these tests rely on — proof it is not a rubber stamp", () => {
  it("parses a well-formed document and resolves its entities", () => {
    const root = parseXmlDocument(
      `<?xml version="1.0" encoding="utf-8"?>\n<fetch top="1"><condition attribute="n" operator="eq" value="a &amp; b" /></fetch>`,
    );

    expect(root.name).toBe("fetch");
    expect(root.attributes.top).toBe("1");
    expect(findElements(root, "condition")[0].attributes.value).toBe("a & b");
  });

  it("resolves a numeric character reference", () => {
    expect(findElements(parseXmlDocument(`<a v="&#65;&#x42;" />`), "a")[0].attributes.v).toBe("AB");
  });

  it("rejects the shape the code produced before R-19 was fixed", () => {
    // These are the documents R-19 used to send for the names "Save & Close" and 'He said "go"'. If the
    // reader accepted them, every assertion below would be worthless, so the pre-fix text is asserted
    // ill-formed here and now.
    expect(() => parseXmlDocument(`<fetch><condition value="Save & Close" /></fetch>`)).toThrow(XmlParseError);
    expect(() => parseXmlDocument(`<fetch><condition value="He said "go"" /></fetch>`)).toThrow(XmlParseError);
  });

  it.each([
    ["a raw < in an attribute value", `<a v="x < y" />`],
    ["an unquoted attribute value", `<a v=x />`],
    ["a missing attribute value", `<a v />`],
    ["a mismatched end tag", `<a><b></a></b>`],
    ["a missing end tag", `<a><b></a>`],
    ["a duplicate attribute", `<a v="1" v="2" />`],
    ["an undeclared entity", `<a v="&copy;" />`],
    ["an unterminated entity reference", `<a v="&amp" />`],
    ["a raw & in element text", `<a>x & y</a>`],
    ["content after the root element", `<a />trailing`],
    ["a second root element", `<a /><b />`],
    ["a comment", `<!-- c --><a />`],
    ["a DOCTYPE", `<!DOCTYPE fetch><a />`],
    ["no root element at all", `   `],
  ])("rejects %s", (_label, document) => {
    expect(() => parseXmlDocument(document)).toThrow(XmlParseError);
  });
});

describe("R-19 corrected: the button-name lookup is escaped, well-formed and value-preserving", () => {
  beforeEach(() => {
    installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(ESCAPE_MATRIX)("$label", async ({ name, escaped }) => {
    for (const [path, makeHelper] of clickPaths()) {
      const fetchXml = await buttonNameQueryFor(makeHelper, name);

      // The document must parse: parseXmlDocument throws on exactly the text R-19 used to produce.
      const condition = buttonNameCondition(fetchXml, `${path} path`);

      expect(authoredAttributeValue(fetchXml, "esp_buttonname"), `${path} path attribute text`).toBe(escaped);
      expect(condition.attributes.value, `${path} path selects the stored name`).toBe(name);
    }
  });

  it("sends byte-identical query text from the form, grid and subgrid path", async () => {
    const name = 'Report & export "now" <v2>';
    const form = await buttonNameQueryFor(formHelper, name);
    const grid = await buttonNameQueryFor(gridHelper, name);
    const subgrid = await buttonNameQueryFor(subgridHelper, name);

    // One construction point, so the three containers cannot drift apart.
    expect(grid).toBe(form);
    expect(subgrid).toBe(form);
  });

  it("keeps URL encoding and XML escaping as two separate concerns", async () => {
    const http = installHttpStub();
    await formHelper().initializeSettings("Save & Close");

    const read = onlyButtonSettingRead(http);
    // The percent-encoding still protects the URL structure: no bare & reaches the query string.
    expect(read.url.slice(read.url.indexOf("?") + 1).includes("&")).toBe(false);
    // and the document inside it is what carries the XML entities.
    expect(new URL(read.url).searchParams.get("fetchXml")).toContain('value="Save &amp; Close"');
    expect(buttonNameCondition(fetchXmlOf(read.url), "form path").attributes.value).toBe("Save & Close");
  });

  it("selects a name that already contains entity-like text as that literal name", async () => {
    const fetchXml = await buttonNameQueryFor(formHelper, "&amp;");

    expect(authoredAttributeValue(fetchXml, "esp_buttonname")).toBe("&amp;amp;");
    expect(buttonNameCondition(fetchXml, "form path").attributes.value).toBe("&amp;");
    expect(unescapeXmlAttribute("&amp;amp;")).toBe("&amp;");
  });

  it("still interpolates only a GUID and an LCID into the advanced-setting query", async () => {
    const http = installHttpStub();
    await formHelper().initializeSettings("MyButton");

    const values = conditionValueByAttribute(advancedSettingQuery(http));
    expect(values.get("esp_mainbuttonsetting")).toBe("11111111-1111-1111-1111-111111111111");
    expect(values.get("esp_lcid")).toBe("1033");
  });

  it("resolves the language row by the current user's LCID, not by a stored default", async () => {
    installXrmStub({ languageId: 1041 });
    const http = installHttpStub();
    await formHelper().initializeSettings("MyButton");

    expect(conditionValueByAttribute(advancedSettingQuery(http)).get("esp_lcid")).toBe("1041");
  });
});

describe("R-19 corrected: the language lookup filter escapes the value it interpolates", () => {
  // The second construction site. It is not on the click path — it feeds the language lookup on the
  // settings form — but it interpolates a value read back from a record, so it takes the same rule.
  beforeEach(() => {
    installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escapes an id that contains markup, so the filter stays well-formed", async () => {
    const row = { ...buildAdvancedSetting(), _esp_settinglanguage_value: "neffe & sons" };
    installHttpStub({ advancedSetting: row });

    const filter = await formHelper().getFilterLookupForLanguage("11111111-1111-1111-1111-111111111111", "1033");

    expect(filter).toBe(
      `<filter type='and'><condition attribute="esp_languageid" operator="ne" value="neffe &amp; sons" /></filter>`,
    );
    expect(findElements(parseXmlDocument(filter), "condition")[0].attributes.value).toBe("neffe & sons");
  });

  it("leaves a GUID-valued language id byte-identical, which is the normal case", async () => {
    const guid = "33333333-3333-3333-3333-333333333333";
    installHttpStub({ advancedSetting: { ...buildAdvancedSetting(), _esp_settinglanguage_value: guid } });

    const filter = await formHelper().getFilterLookupForLanguage("11111111-1111-1111-1111-111111111111", "1033");

    expect(filter).toBe(
      `<filter type='and'><condition attribute="esp_languageid" operator="ne" value="${guid}" /></filter>`,
    );
  });

  it("escapes every condition when several language rows come back", async () => {
    installHttpStub({
      configResponder: () =>
        new Response(
          JSON.stringify({
            value: [
              { ...buildAdvancedSetting(), _esp_settinglanguage_value: "a & b" },
              { ...buildAdvancedSetting(), _esp_settinglanguage_value: 'c "d"' },
              { ...buildAdvancedSetting(), _esp_settinglanguage_value: "plain" },
            ],
          }),
          { status: 200 },
        ),
    });

    const filter = await formHelper().getFilterLookupForLanguage("11111111-1111-1111-1111-111111111111", "1033");

    expect(filter).toBe(
      `<filter type='and'>` +
        `<condition attribute="esp_languageid" operator="ne" value="a &amp; b" />` +
        `<condition attribute="esp_languageid" operator="ne" value="c &quot;d&quot;" />` +
        `<condition attribute="esp_languageid" operator="ne" value="plain" />` +
        `</filter>`,
    );
    expect(findElements(parseXmlDocument(filter), "condition")).toHaveLength(3);
  });

  it("renders a missing lookup id as the same text the template produced before the fix", async () => {
    installHttpStub({ advancedSetting: { ...buildAdvancedSetting(), _esp_settinglanguage_value: undefined } });

    const filter = await formHelper().getFilterLookupForLanguage("11111111-1111-1111-1111-111111111111", "1033");

    // Unchanged by R2.1 and deliberately not "fixed" here: an advanced setting whose language id is
    // absent still produces a condition against the text "undefined" instead of a reported configuration
    // gap. Escaping must not silently change what the settings form asks for.
    expect(filter).toBe(
      `<filter type='and'><condition attribute="esp_languageid" operator="ne" value="undefined" /></filter>`,
    );
  });

  it("keeps the filter markup itself unescaped, because the code authors it", async () => {
    installHttpStub({ advancedSetting: { ...buildAdvancedSetting(), _esp_settinglanguage_value: "safe" } });

    const filter = await formHelper().getFilterLookupForLanguage("11111111-1111-1111-1111-111111111111", "1033");

    expect(filter.startsWith("<filter type='and'>")).toBe(true);
    expect(filter.endsWith("</filter>")).toBe(true);
  });
});

describe("CHARACTERISATION (unfixed, F-35a): an empty configuration result set is still silent", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops after one query and reports nothing when no button setting exists", async () => {
    const http = installHttpStub({ buttonSetting: null });
    const helper = formHelper();

    await helper.initializeSettings("NoSuchButton");

    // R2.1 changed how the query is written, not what an empty answer means. Rule 45 still requires
    // "no rows" and "could not read" to be distinguishable, and neither message exists yet.
    expect(http.configReads()).toHaveLength(1);
    expect(http.endpointPosts()).toHaveLength(0);
    expect(xrm.alerts).toEqual([]);
    expect(helper.buttonSetting).toBeUndefined();
  });
});

/** The three click paths, all of which reach the one retrieval seam this file is about. */
function clickPaths(): Array<[string, () => BaseHelper]> {
  return [
    ["form", formHelper],
    ["grid", gridHelper],
    ["subgrid", subgridHelper],
  ];
}

function formHelper(): BaseHelper {
  return new ButtonFormHelper(buildFormContext());
}

function gridHelper(): BaseHelper {
  return new ButtonGridHelper(buildGridControl({ selectedRecordIds: [GRID_ROW_ID] }));
}

/** A grid control whose getParent() answers: the subgrid container, which shares the grid helper. */
function subgridHelper(): BaseHelper {
  return new ButtonGridHelper(buildGridControl({ selectedRecordIds: [GRID_ROW_ID], parent: {} }));
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

/**
 * Parses a document and returns its `esp_buttonname` condition.
 *
 * The parse is the assertion: `parseXmlDocument` throws `XmlParseError` on the ill-formed text this code
 * used to produce, so an escaping regression fails here rather than producing a confusing value mismatch.
 */
function buttonNameCondition(fetchXml: string, label: string): XmlElement {
  const condition = conditions(fetchXml).find((element) => element.attributes.attribute === "esp_buttonname");
  if (!condition) {
    throw new Error(`${label}: no condition on esp_buttonname in:\n${fetchXml}`);
  }
  return condition;
}

/**
 * The attribute text exactly as the runtime wrote it, before any entity resolution.
 *
 * This is what separates "the document parses" from "the document says what we meant": the parser resolves
 * entities, this shows the raw bytes that left the browser. It is well-defined now precisely because the
 * escaper removes every `"`, so the closing quote can never be the maker's.
 */
function authoredAttributeValue(fetchXml: string, attribute: string): string {
  const match = new RegExp(`attribute="${attribute}"[^>]*?value="([^"]*)"`).exec(fetchXml);
  if (!match) {
    throw new Error(`No value attribute for ${attribute} in:\n${fetchXml}`);
  }
  return match[1];
}

/** Every `condition` element of a parsed document, in document order. */
function conditions(fetchXml: string): XmlElement[] {
  return findElements(parseXmlDocument(fetchXml), "condition");
}

/**
 * Every condition's value keyed by its attribute name, exactly as the parser read them.
 *
 * @param fetchXml - The decoded document.
 * @returns Attribute name to parsed value, one entry per condition.
 */
function conditionValueByAttribute(fetchXml: string): Map<string, string> {
  return new Map(conditions(fetchXml).map((condition) => [condition.attributes.attribute, condition.attributes.value]));
}
