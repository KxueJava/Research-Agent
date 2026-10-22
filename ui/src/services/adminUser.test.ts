import { describe, it, expect, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn().mockResolvedValue(true) }));
vi.mock("./index", () => ({ default: { post } }));

describe("public registration", () => {
  it("uses registration endpoint and sends only credentials", async () => {
    const { adminUserApi } = await import("./adminUser");
    await adminUserApi.register({ username: "ordinary", password: "test-password" });
    expect(post).toHaveBeenCalledWith("/api/v1/admin/admin-user/register", {
      username: "ordinary", password: "test-password",
    });
  });
});
