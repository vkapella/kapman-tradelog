import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startPositionSnapshotCompute: vi.fn(),
}));

vi.mock("@/lib/positions/compute-position-snapshot", () => ({
  startPositionSnapshotCompute: mocks.startPositionSnapshotCompute,
}));

describe("startImportPositionSnapshotRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts one snapshot for the affected internal account", async () => {
    mocks.startPositionSnapshotCompute.mockResolvedValue({ snapshotId: "snapshot-1", status: "PENDING" });
    const { startImportPositionSnapshotRefresh } = await import("./start-import-position-snapshot");

    await expect(startImportPositionSnapshotRefresh("account-internal-1")).resolves.toEqual({
      positionSnapshot: { snapshotId: "snapshot-1", status: "PENDING" },
      warning: null,
    });
    expect(mocks.startPositionSnapshotCompute).toHaveBeenCalledTimes(1);
    expect(mocks.startPositionSnapshotCompute).toHaveBeenCalledWith(["account-internal-1"]);
  });

  it("returns a warning instead of failing the committed import when snapshot start fails", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.startPositionSnapshotCompute.mockRejectedValue(new Error("snapshot unavailable"));
    const { startImportPositionSnapshotRefresh } = await import("./start-import-position-snapshot");

    await expect(startImportPositionSnapshotRefresh("account-internal-1")).resolves.toEqual({
      positionSnapshot: null,
      warning: {
        code: "POSITION_SNAPSHOT_REFRESH_FAILED",
        message: "snapshot unavailable",
      },
    });
    expect(consoleWarn).toHaveBeenCalledOnce();
  });
});
