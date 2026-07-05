import { describe, it, expect } from "vitest";
import { isPrivateIp, validateWebhookUrl, assertPublicUrl } from "./net-guard";

describe("isPrivateIp", () => {
  it("flags IPv4 private / loopback / link-local ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "93.184.216.34"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
  it("flags IPv6 loopback / link-local / unique-local / mapped-private", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:169.254.169.254", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public IPv6 and mapped-public", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("validateWebhookUrl", () => {
  it("accepts a normal https URL", () => {
    expect(validateWebhookUrl("https://example.com/hook")).toBe("https://example.com/hook");
  });
  it("rejects non-https schemes", () => {
    expect(() => validateWebhookUrl("http://example.com")).toThrow(/https/);
    expect(() => validateWebhookUrl("file:///etc/passwd")).toThrow();
    expect(() => validateWebhookUrl("gopher://x")).toThrow();
  });
  it("rejects metadata / localhost hostnames", () => {
    expect(() => validateWebhookUrl("https://metadata.google.internal/")).toThrow(/not allowed/);
    expect(() => validateWebhookUrl("https://localhost/hook")).toThrow(/not allowed/);
  });
  it("rejects literal private IPs", () => {
    expect(() => validateWebhookUrl("https://169.254.169.254/latest")).toThrow(/private/);
    expect(() => validateWebhookUrl("https://10.0.0.1/")).toThrow(/private/);
    expect(() => validateWebhookUrl("https://[::1]/")).toThrow(/private/);
  });
  it("rejects garbage", () => {
    expect(() => validateWebhookUrl("not a url")).toThrow();
    expect(() => validateWebhookUrl("")).toThrow();
    expect(() => validateWebhookUrl(null as any)).toThrow();
  });
});

describe("assertPublicUrl", () => {
  it("rejects a literal loopback/private IP without needing DNS", async () => {
    await expect(assertPublicUrl("https://127.0.0.1/")).rejects.toThrow(/private|not allowed/);
    await expect(assertPublicUrl("https://169.254.169.254/")).rejects.toThrow(/private/);
  });
  it("rejects non-https at dispatch time too", async () => {
    await expect(assertPublicUrl("http://example.com/")).rejects.toThrow(/https/);
  });
});
