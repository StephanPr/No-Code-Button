/* eslint-disable camelcase */
import { vi } from "vitest";
import type { esp_ButtonAdvancedSetting, esp_ButtonSetting } from "../../src/dataverse-gen";
import { buildAdvancedSetting, buildButtonSetting } from "./xrm-stub";

/**
 * A `fetch` double for the two HTTP surfaces the runtime uses: the Web API reads that load a button's
 * configuration, and the single POST to the endpoint the button calls.
 *
 * The boundary is faked, the logic under test is not: every call is recorded so a spec can assert the
 * exact URL, method and body the production code produced, and an endpoint call that has no canned
 * answer **fails loudly** instead of quietly succeeding.
 */

/** One recorded outbound call. */
export interface RecordedRequest {
  method: string;
  url: string;
  /** Parsed body when the runtime sent JSON, otherwise the raw text it sent. */
  body?: unknown;
}

/** A canned endpoint answer. */
export interface EndpointAnswer {
  status: number;
  body?: string;
}

/** A rejected endpoint call — the DNS/URI-level failure the async path is built around. */
export interface EndpointFailure {
  rejectWith: Error;
}

export interface HttpStubOptions {
  /** `undefined`: the default record. `null`: the query returns no rows at all. */
  buttonSetting?: esp_ButtonSetting | null;
  /** `undefined`: the default record. `null`: the query returns no rows at all. */
  advancedSetting?: esp_ButtonAdvancedSetting | null;
  /** Replaces the canned 200 answer for every Web API read (statuses, empty bodies, rejections). */
  configResponder?: (url: string) => Response | Promise<Response>;
  /** Answers handed to endpoint calls in order; an entry may instead reject the call. */
  endpointAnswers?: Array<EndpointAnswer | EndpointFailure>;
}

export interface HttpSpy {
  /** Every call in order, Web API reads and endpoint calls alike. */
  calls: RecordedRequest[];
  /** The GETs against `/api/data/` — the configuration reads. */
  configReads(): RecordedRequest[];
  /** The calls that are not Web API reads — the endpoint POSTs. */
  endpointPosts(): RecordedRequest[];
}

/** The one path prefix that separates configuration reads from endpoint calls. */
const WEB_API_PREFIX = "/api/data/";

/** Installs the `fetch` double. Call `vi.unstubAllGlobals()` in `afterEach`. */
export function installHttpStub(options: HttpStubOptions = {}): HttpSpy {
  const calls: RecordedRequest[] = [];
  const answers = options.endpointAnswers ?? [];
  let endpointCalls = 0;

  const fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, body: parseBody(init?.body) });

    if (!url.includes(WEB_API_PREFIX)) {
      const answer = answers[endpointCalls];
      endpointCalls += 1;
      if (!answer) {
        throw new Error(
          `The test canned no endpoint answer for call #${endpointCalls} to ${url}. ` +
            `Add one to installHttpStub({ endpointAnswers: [...] }) instead of letting a stray request pass.`,
        );
      }
      if ("rejectWith" in answer) {
        throw answer.rejectWith;
      }
      // A null body is legal for every status; an empty-string body is not legal for 204/304.
      return new Response(answer.body ? answer.body : null, { status: answer.status });
    }

    if (options.configResponder) {
      return options.configResponder(url);
    }
    return new Response(JSON.stringify({ value: configRows(url, options) }), { status: 200 });
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    configReads: () => calls.filter((call) => call.url.includes(WEB_API_PREFIX)),
    endpointPosts: () => calls.filter((call) => !call.url.includes(WEB_API_PREFIX)),
  };
}

/** The rows each configuration query answers with; `null` means the table has no matching record. */
function configRows(url: string, options: HttpStubOptions): unknown[] {
  const advanced = url.includes("esp_buttonadvancedsettings");
  if (advanced) {
    return options.advancedSetting === null ? [] : [options.advancedSetting ?? buildAdvancedSetting()];
  }
  return options.buttonSetting === null ? [] : [options.buttonSetting ?? buildButtonSetting()];
}

/** JSON for assertions, but never at the cost of hiding a body the runtime sent as text. */
function parseBody(body?: BodyInit | null): unknown {
  if (typeof body !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
