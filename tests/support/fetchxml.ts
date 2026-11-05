/**
 * Helpers for asserting what the runtime actually puts on the wire.
 *
 * These are **not** a Dataverse simulator. They decode the FetchXML our own code builds and check the
 * three characters that make an XML attribute ill-formed — the same three the 2026-11-05 reproduction
 * (ledger F-28) confirmed a strict XML parser rejects. Whether the Dataverse query parser accepts or
 * rejects such a request, and with which status, has never been observed from this host and must never
 * be asserted from anything in this module.
 */

/** Separates the query text from the rest of a Web API collection URL. */
const FETCH_XML_PARAM = "?fetchXml=";

/**
 * Returns the FetchXML text carried by a Web API collection URL.
 *
 * `decodeURIComponent` is used deliberately instead of `URLSearchParams`: the latter also converts `+`
 * into a space, which would silently hide a real maker-typed character from the assertion.
 *
 * @param url - The URL handed to `fetch`.
 * @returns The decoded query text.
 * @throws Error if the URL carries no `fetchXml=` parameter.
 */
export function fetchXmlOf(url: string): string {
  const index = url.indexOf(FETCH_XML_PARAM);
  if (index === -1) {
    throw new Error(`URL carries no ${FETCH_XML_PARAM} parameter: ${url}`);
  }
  return decodeURIComponent(url.slice(index + FETCH_XML_PARAM.length));
}

/**
 * Returns the value text of the first `operator="eq"` condition for an attribute.
 *
 * Reading, and its limit, stated so no test over-claims: the capture stops at the first `" />` after the
 * attribute, which is exactly where a strict XML parser ends a double-quoted attribute. For a value with
 * no quote inside it that is the authored text; for a value that *does* contain a quote, the parse ends
 * early — which is the defect, and {@link xmlAttributeViolations} reports it as `unescaped-quote`. The
 * verbatim authored text is therefore asserted with `toContain(\`value="\${name}"\`)`, not with this
 * function.
 *
 * @param fetchXml - Decoded FetchXML text.
 * @param attribute - The condition's `attribute` name.
 * @returns The value text as a parser would read it.
 * @throws Error if no `eq` condition exists for that attribute.
 */
export function authoredConditionValue(fetchXml: string, attribute: string): string {
  const pattern = new RegExp(`attribute="${attribute}" operator="eq" value="(.*?)" \\/>`, "s");
  const match = pattern.exec(fetchXml);
  if (!match) {
    throw new Error(`No eq condition on ${attribute} in:\n${fetchXml}`);
  }
  return match[1];
}

/** An ill-formed character inside an authored XML attribute value. */
export type XmlAttributeViolation = "unescaped-ampersand" | "unescaped-less-than" | "unescaped-quote";

/** The character sequences an XML attribute may contain without escaping. */
const WELL_FORMED_ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;

/**
 * Lists the ill-formed characters in an authored attribute value, in first-appearance order.
 *
 * Scope, stated so no test over-claims: a raw `&` that does not begin a recognised entity, a raw `<`,
 * and a raw `"` inside a double-quoted value. Those are the three violations F-28 verified against a
 * strict parser. This function says nothing about tag structure, about other XML constructs, or about
 * how Dataverse reacts to the request.
 *
 * @param value - The authored attribute value.
 * @returns The distinct violations found; empty when the value is well-formed.
 */
export function xmlAttributeViolations(value: string): XmlAttributeViolation[] {
  const found: XmlAttributeViolation[] = [];
  const add = (violation: XmlAttributeViolation): void => {
    if (!found.includes(violation)) {
      found.push(violation);
    }
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "&" && !WELL_FORMED_ENTITY.test(value.slice(index))) {
      add("unescaped-ampersand");
    } else if (character === "<") {
      add("unescaped-less-than");
    } else if (character === '"') {
      add("unescaped-quote");
    }
  }

  return found;
}
