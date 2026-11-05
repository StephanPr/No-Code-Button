/**
 * Helpers for asserting what the runtime actually puts on the wire.
 *
 * These are **not** a Dataverse simulator. They decode the FetchXML our own code builds so a test can read
 * the document back out of the request URL; well-formedness itself is judged by the strict reader in
 * `./xml.ts`. Whether the Dataverse query parser accepts a given request, and with which status, has never
 * been observed from this host and must never be asserted from anything in this module.
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
 * Resolves the XML entities an escaped attribute value may contain, returning the text the maker typed.
 *
 * This is the test side of the R-19 contract, written as the mirror of what a parser does rather than as a
 * call into the production escaper, and `&amp;` is resolved **last** so a stored name that already contains
 * entity-like text (`&amp;`) comes back as those five characters and not as `&`. The strict reader in
 * `./xml.ts` does the same job completely; this one exists so a test can state the entity rule on its own.
 * It recognises the five named entities the escaping utility can emit and nothing else.
 *
 * @param value - The attribute value as authored in the document.
 * @returns The text the value encodes.
 */
export function unescapeXmlAttribute(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
