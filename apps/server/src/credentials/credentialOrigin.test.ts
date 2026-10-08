import { describe, expect, it } from "vite-plus/test";

import { matchingOrigin, requestedHost, savedUrlsMatchHost } from "./credentialOrigin.ts";

describe("matchingOrigin", () => {
  it("matches the same host on any path", () => {
    expect(matchingOrigin(["https://github.com"], "https://github.com/login")).toBe(
      "https://github.com",
    );
  });

  it("treats a leading www. as the same host", () => {
    expect(matchingOrigin(["https://amazon.com"], "https://www.amazon.com/ap/signin")).toBe(
      "https://www.amazon.com",
    );
  });

  it("reads a saved URL without a scheme as https", () => {
    expect(matchingOrigin(["github.com"], "https://github.com/session")).toBe("https://github.com");
    expect(matchingOrigin(["github.com"], "http://github.com/session")).toBeNull();
  });

  it("refuses look-alike, parent and sub domains", () => {
    expect(matchingOrigin(["https://github.com"], "https://github.com.evil.io/login")).toBeNull();
    expect(matchingOrigin(["https://github.com"], "https://evilgithub.com/login")).toBeNull();
    expect(matchingOrigin(["https://github.com"], "https://gist.github.com/login")).toBeNull();
    expect(matchingOrigin(["https://login.example.com"], "https://example.com/")).toBeNull();
  });

  it("refuses a downgrade from https to http", () => {
    expect(matchingOrigin(["https://example.com"], "http://example.com/login")).toBeNull();
  });

  it("allows http where the saved URL says http", () => {
    expect(matchingOrigin(["http://intranet.example"], "http://intranet.example/")).toBe(
      "http://intranet.example",
    );
  });

  it("allows http for schemeless development hosts and checks the port", () => {
    expect(matchingOrigin(["localhost:3000"], "http://localhost:3000/login")).toBe(
      "http://localhost:3000",
    );
    expect(matchingOrigin(["myapp.test"], "http://myapp.test/login")).toBe("http://myapp.test");
    expect(matchingOrigin(["localhost:3000"], "http://localhost:4000/login")).toBeNull();
    expect(matchingOrigin(["https://example.com:8443"], "https://example.com/")).toBeNull();
  });

  it("refuses non-web pages and unparsable input", () => {
    expect(matchingOrigin(["https://github.com"], "about:blank")).toBeNull();
    expect(matchingOrigin(["https://github.com"], "file:///etc/passwd")).toBeNull();
    expect(matchingOrigin(["javascript:alert(1)", ""], "https://github.com/")).toBeNull();
    expect(matchingOrigin([], "https://github.com/")).toBeNull();
  });

  it("matches when any of several saved URLs fits", () => {
    expect(
      matchingOrigin(
        ["https://example.com", "https://accounts.example.org"],
        "https://accounts.example.org/",
      ),
    ).toBe("https://accounts.example.org");
  });
});

describe("matchingOrigin with subdomains allowed", () => {
  const allow = { allowSubdomains: true };

  it("fills a subdomain of the saved host", () => {
    expect(matchingOrigin(["https://example.com"], "https://login.example.com/", allow)).toBe(
      "https://login.example.com",
    );
  });

  it("still refuses look-alikes, parents and other schemes", () => {
    expect(matchingOrigin(["https://example.com"], "https://evilexample.com/", allow)).toBeNull();
    expect(matchingOrigin(["https://login.example.com"], "https://example.com/", allow)).toBeNull();
    expect(matchingOrigin(["https://example.com"], "http://login.example.com/", allow)).toBeNull();
    expect(matchingOrigin(["localhost:3000"], "http://a.localhost:3000/", allow)).toBeNull();
  });
});

describe("request host matching", () => {
  it("accepts a host or a full URL", () => {
    expect(requestedHost("github.com")).toBe("github.com");
    expect(requestedHost("https://www.github.com/login?return_to=/")).toBe("github.com");
    expect(requestedHost("not a host")).toBeNull();
  });

  it("lists items saved for the host, ignoring others", () => {
    expect(savedUrlsMatchHost(["https://github.com/login"], "github.com")).toBe(true);
    expect(savedUrlsMatchHost(["https://gitlab.com"], "github.com")).toBe(false);
  });
});
