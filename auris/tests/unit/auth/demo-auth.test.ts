import {
  buildDemoAuthUser,
  decodeDemoAuthCookieValue,
  encodeDemoAuthCookieValue,
} from "@/features/auth/demo-auth";

describe("demo auth helpers", () => {
  it("builds a stable demo user from an email identifier", () => {
    expect(buildDemoAuthUser("Demo@Example.com")).toEqual({
      email: "demo@example.com",
      id: "demo-user-demo-example-com",
    });
  });

  it("builds a stable demo user from a phone identifier", () => {
    expect(buildDemoAuthUser("138 0013 8000")).toEqual({
      email: "13800138000@demo.local",
      id: "demo-user-13800138000",
    });
  });

  it("round-trips an encoded demo auth cookie value", () => {
    const user = {
      email: "demo@example.com",
      id: "demo-user-demo-example-com",
    };

    expect(decodeDemoAuthCookieValue(encodeDemoAuthCookieValue(user))).toEqual(
      user,
    );
  });

  it("returns null for invalid cookie payloads", () => {
    expect(decodeDemoAuthCookieValue("invalid-cookie")).toBeNull();
  });
});
