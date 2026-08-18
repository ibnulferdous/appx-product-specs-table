import { describe, expect, it } from "vitest";
import { buildAdminAppBase } from "./adminAppLink";

describe("buildAdminAppBase", () => {
  it("strips the .myshopify.com suffix and links through the client id", () => {
    expect(buildAdminAppBase("appx-dev.myshopify.com", "abc123")).toBe(
      "https://admin.shopify.com/store/appx-dev/apps/abc123",
    );
  });

  it("accepts a shop domain that is already a bare store handle", () => {
    expect(buildAdminAppBase("appx-dev", "abc123")).toBe(
      "https://admin.shopify.com/store/appx-dev/apps/abc123",
    );
  });

  it("only strips the suffix at the END of the domain", () => {
    // A store handle that merely CONTAINS the string must survive intact.
    expect(
      buildAdminAppBase("my.myshopify.com-store.myshopify.com", "abc123"),
    ).toBe(
      "https://admin.shopify.com/store/my.myshopify.com-store/apps/abc123",
    );
  });

  it("produces a base an app path can be appended to directly", () => {
    const base = buildAdminAppBase("appx-dev.myshopify.com", "abc123");
    expect(`${base}/app/templates/cmsfriit1000cvprge1xzn2yc`).toBe(
      "https://admin.shopify.com/store/appx-dev/apps/abc123/app/templates/cmsfriit1000cvprge1xzn2yc",
    );
  });
});
