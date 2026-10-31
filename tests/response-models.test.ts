import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorMessageResponse, RedirectResponse } from "../src/Models/BaseButtonResponseModels";
import { installXrmStub, type XrmSpy } from "./support/xrm-stub";

/**
 * These two parsers are the whole contract a flow response has to satisfy, and a malformed
 * body must become a visible dialog plus a thrown error - never a silent undefined.
 */
describe("RedirectResponse.fromJson", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the documented body", () => {
    expect(RedirectResponse.fromJson('{"redirectUri":"https://www.example.com"}').redirectUri).toBe(
      "https://www.example.com",
    );
  });

  it("rejects a body without a redirectUri and tells the user", () => {
    expect(() => RedirectResponse.fromJson('{"message":"done"}')).toThrow(
      "Invalid JSON format for RedirectResponse",
    );
    expect(xrm.alerts).toEqual([{ title: "Redirect URI Not Found", text: "The redirect URI was not found in the response." }]);
  });

  it("rejects a redirectUri that is not a string", () => {
    expect(() => RedirectResponse.fromJson('{"redirectUri":42}')).toThrow("Invalid JSON format for RedirectResponse");
    expect(xrm.alerts).toHaveLength(1);
  });

  it("does not swallow invalid JSON", () => {
    expect(() => RedirectResponse.fromJson("<html>Bad Gateway</html>")).toThrow(SyntaxError);
  });
});

describe("ErrorMessageResponse.fromJson", () => {
  let xrm: XrmSpy;

  beforeEach(() => {
    xrm = installXrmStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the title when the flow provides one", () => {
    const parsed = ErrorMessageResponse.fromJson('{"title":"Error Title","message":"Something went wrong"}');

    expect(parsed).toEqual({ title: "Error Title", message: "Something went wrong" });
  });

  it("defaults the title to an empty string, which the dialog then shows as blank", () => {
    const parsed = ErrorMessageResponse.fromJson('{"message":"Something went wrong"}');

    expect(parsed.message).toBe("Something went wrong");
    expect(parsed.title).toBe("");
  });

  it("rejects a body without a message and tells the user", () => {
    expect(() => ErrorMessageResponse.fromJson('{"detail":"nope"}')).toThrow("Invalid JSON format for ErrorMessage");
    expect(xrm.alerts).toEqual([
      { title: "Error Message Not Found", text: "The error message was not found in the response." },
    ]);
  });
});
