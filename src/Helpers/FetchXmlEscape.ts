/**
 * Escapes text so it can be placed inside an XML attribute value.
 *
 * The runtime interpolates maker-supplied text — a button name — straight into a FetchXML condition, and
 * the finished query is then percent-encoded for the URL. That encoding makes the *request* safe; it says
 * nothing about the *document*, and an ampersand, a quote or an angle bracket in a button name produced
 * XML that a strict parser rejects (defect R-19). This module is the single place that closes the gap, so
 * the form, grid and subgrid click paths cannot drift apart.
 */
export class FetchXmlEscape {
  /**
   * Returns the XML representation of a value, never a transformed copy of the value itself.
   *
   * The five substitutions are the complete set for a double-quoted attribute value. The ampersand is
   * replaced first and the rest afterwards, and that order is what makes a button actually named `&amp;`
   * come out as `&amp;amp;`: the document then carries those five characters as data, so the query still
   * selects the name the maker stored instead of quietly becoming a lookup for `&`.
   *
   * Nothing else is touched — no trimming, no case change, no Unicode normalisation, no whitespace
   * collapsing. A customer-defined name is data; the only change here is how XML spells it.
   *
   * @param value - The text to place inside an attribute value.
   * @returns The escaped text. Input without any of the five characters is returned unchanged.
   */
  public static escapeAttributeValue(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
