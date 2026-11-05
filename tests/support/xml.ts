/**
 * A strict XML reader for the documents this repository authors, so that a test can prove a generated
 * FetchXML actually **parses** rather than merely "looks like XML".
 *
 * Scope, stated so nothing is over-claimed. Supported: one XML declaration, one root element, nested
 * elements, double- or single-quoted attributes, self-closing tags, the five predefined entities and
 * numeric character references. Everything outside that — comments, CDATA, DOCTYPE, processing
 * instructions other than the declaration, namespaces, duplicate attributes, mismatched or missing end
 * tags, an unescaped `&`/`<`/quote — is reported as an error instead of being accepted silently, because a
 * lenient reader would turn this checker into a rubber stamp. It is used by tests only and never ships.
 *
 * It judges the document **we** build. It says nothing about how a Dataverse Web API reacts to a request
 * that carries that document.
 */

/** An element produced by {@link parseXmlDocument}. */
export interface XmlElement {
  /** The element's tag name. */
  name: string;
  /** Attribute values with every entity reference already resolved. */
  attributes: Record<string, string>;
  /** Child elements, in document order. */
  children: XmlElement[];
}

/** Raised when the text is not well-formed, naming the offset where reading stopped. */
export class XmlParseError extends Error {
  constructor(message: string, position: number) {
    super(`${message} (at character ${position})`);
    this.name = "XmlParseError";
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const NAME_START = /[A-Za-z_]/;
const NAME_REST = /[A-Za-z0-9_.-]/;

/**
 * Parses an XML document into elements whose attribute values have every entity reference resolved.
 *
 * @param text - The document text, typically the decoded FetchXML the runtime sent.
 * @returns The root element.
 * @throws XmlParseError if the text is not well-formed within the supported subset.
 */
export function parseXmlDocument(text: string): XmlElement {
  let index = 0;

  const fail = (message: string): never => {
    throw new XmlParseError(message, index);
  };

  const skipSpace = (): void => {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }
  };

  const literal = (expected: string, what: string): void => {
    if (!text.startsWith(expected, index)) {
      fail(`Expected ${what}`);
    }
    index += expected.length;
  };

  const name = (what: string): string => {
    if (index >= text.length || !NAME_START.test(text[index])) {
      fail(`Expected ${what}`);
    }
    const start = index;
    index += 1;
    while (index < text.length && NAME_REST.test(text[index])) {
      index += 1;
    }
    return text.slice(start, index);
  };

  /** Resolves entity references, rejecting an ampersand that does not begin a known one. */
  const resolveEntities = (raw: string, context: string): string => {
    let result = "";
    let cursor = 0;
    while (cursor < raw.length) {
      const ampersand = raw.indexOf("&", cursor);
      if (ampersand === -1) {
        result += raw.slice(cursor);
        break;
      }
      result += raw.slice(cursor, ampersand);

      const semicolon = raw.indexOf(";", ampersand + 1);
      const reference = semicolon === -1 ? "" : raw.slice(ampersand + 1, semicolon);
      if (semicolon === -1 || reference.length === 0 || reference.length > 8) {
        fail(`Unescaped or unterminated entity reference in ${context}: ${raw.slice(ampersand, ampersand + 12)}`);
      }

      if (reference.startsWith("#")) {
        const code =
          reference[1] === "x" ? Number.parseInt(reference.slice(2), 16) : Number.parseInt(reference.slice(1), 10);
        if (!Number.isFinite(code) || code < 0) {
          fail(`Invalid numeric character reference &${reference}; in ${context}`);
        }
        result += String.fromCodePoint(code);
      } else if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, reference)) {
        result += NAMED_ENTITIES[reference];
      } else {
        fail(`Reference to undeclared entity &${reference}; in ${context}`);
      }
      cursor = semicolon + 1;
    }
    return result;
  };
  const attributeValue = (): string => {
    const quote = text[index];
    if (quote !== '"' && quote !== "'") {
      fail("Attribute value must be quoted");
    }
    index += 1;
    const start = index;
    while (index < text.length && text[index] !== quote) {
      if (text[index] === "<") {
        fail("A raw < is not allowed inside an attribute value");
      }
      index += 1;
    }
    if (index >= text.length) {
      fail("Unterminated attribute value");
    }
    const raw = text.slice(start, index);
    index += 1;
    return resolveEntities(raw, "attribute value");
  };

  /** Consumes element text, checking it, and returns nothing: only structure is reported. */
  const elementText = (): void => {
    while (index < text.length && text[index] !== "<") {
      if (text[index] !== "&") {
        index += 1;
        continue;
      }
      const semicolon = text.indexOf(";", index + 1);
      const reference = semicolon === -1 ? "" : text.slice(index + 1, semicolon);
      const known =
        semicolon !== -1 &&
        (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, reference) ||
          /^#[0-9]+$/.test(reference) ||
          /^#x[0-9a-fA-F]+$/.test(reference));
      if (!known) {
        fail(`Unescaped & in element text: ${text.slice(index, index + 12)}`);
      }
      index = semicolon + 1;
    }
  };

  const element = (): XmlElement => {
    literal("<", "an element start tag");
    const elementName = name("an element name");
    const attributes: Record<string, string> = {};

    for (;;) {
      skipSpace();
      if (text.startsWith("/>", index)) {
        index += 2;
        return { name: elementName, attributes, children: [] };
      }
      if (text.startsWith(">", index)) {
        index += 1;
        break;
      }
      const attributeName = name("an attribute name");
      if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
        fail(`Duplicate attribute ${attributeName} on <${elementName}>`);
      }
      skipSpace();
      literal("=", `= after attribute ${attributeName}`);
      skipSpace();
      attributes[attributeName] = attributeValue();
    }

    const children: XmlElement[] = [];
    for (;;) {
      if (index >= text.length) {
        fail(`Missing end tag for <${elementName}>`);
      }
      if (text.startsWith("</", index)) {
        index += 2;
        const closed = name("an end tag name");
        if (closed !== elementName) {
          fail(`End tag </${closed}> does not match <${elementName}>`);
        }
        skipSpace();
        literal(">", "the end of an end tag");
        return { name: elementName, attributes, children };
      }
      if (text[index] === "<") {
        children.push(element());
      } else {
        elementText();
      }
    }
  };

  skipSpace();
  if (text.startsWith("<?xml", index)) {
    const end = text.indexOf("?>", index);
    if (end === -1) {
      fail("Unterminated XML declaration");
    }
    index = end + 2;
  }
  skipSpace();
  if (index >= text.length) {
    fail("The document has no root element");
  }
  if (text.startsWith("<!", index) || text.startsWith("<?", index)) {
    fail("Comments, DOCTYPE and processing instructions are outside what this reader accepts");
  }

  const root = element();
  skipSpace();
  if (index < text.length) {
    fail("Unexpected content after the root element");
  }
  return root;
}

/**
 * Returns the descendant elements with a given tag name, in document order.
 *
 * @param root - The element to search, typically a parsed document's root.
 * @param tag - The element name to look for.
 * @returns Every matching element, deepest-first as they appear in the document.
 */
export function findElements(root: XmlElement, tag: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (element: XmlElement): void => {
    if (element.name === tag) {
      found.push(element);
    }
    element.children.forEach(walk);
  };
  walk(root);
  return found;
}
