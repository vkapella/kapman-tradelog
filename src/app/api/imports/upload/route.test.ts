import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadRouteMocks = vi.hoisted(() => {
  return {
    account: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    import: {
      create: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: uploadRouteMocks.account,
      import: uploadRouteMocks.import,
    },
  };
});

const FIDELITY_CSV = [
  "",
  "",
  "Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date",
  '06/12/2026,"YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER SOLICITED ORDER SPACE EXPL TECHNOLOGIES CORP CL A (SPCX) (Cash)",SPCX,"SPACE EXPL TECHNOLOGIES CORP CL A",Cash,135,100,,,,-13500,-13500.00,06/15/2026',
  "",
].join("\n");

function buildUploadRequest(filename: string): Request {
  return buildCsvUploadRequest(filename, FIDELITY_CSV);
}

function buildCsvUploadRequest(filename: string, content: string): Request {
  const form = new FormData();
  form.append("file", new File([content], filename, { type: "text/csv" }));
  return new Request("http://localhost/api/imports/upload", { method: "POST", body: form });
}

describe("POST /api/imports/upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects Fidelity files whose account id cannot be determined instead of creating a fallback account", async () => {
    const { POST } = await import("./route");

    const response = await POST(buildUploadRequest("statement-from-phone.csv"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("ACCOUNT_ID_MISSING");
    expect(uploadRouteMocks.account.upsert).not.toHaveBeenCalled();
    expect(uploadRouteMocks.import.create).not.toHaveBeenCalled();
  });

  it("accepts iOS-renamed filenames that still contain the account id", async () => {
    uploadRouteMocks.account.findUnique.mockResolvedValueOnce(null);
    uploadRouteMocks.account.upsert.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "X19467537",
      label: "Fidelity X19467537",
      displayLabel: null,
    });
    uploadRouteMocks.import.create.mockResolvedValueOnce({ id: "import-1" });

    const { POST } = await import("./route");

    const response = await POST(buildUploadRequest("History_for_Account_X19467537 (1).csv"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(uploadRouteMocks.account.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: "X19467537" },
      }),
    );
    expect(body.data.account).toEqual({
      accountId: "X19467537",
      label: "Fidelity X19467537",
      isNew: true,
    });
  });

  it("reports an existing account as not new", async () => {
    uploadRouteMocks.account.findUnique.mockResolvedValueOnce({ id: "acct-1" });
    uploadRouteMocks.account.upsert.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "X19467537",
      label: "Fidelity X19467537",
      displayLabel: "Fidelity Brokerage",
    });
    uploadRouteMocks.import.create.mockResolvedValueOnce({ id: "import-1" });

    const { POST } = await import("./route");

    const response = await POST(buildUploadRequest("History_for_Account_X19467537-26.csv"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.account).toEqual({
      accountId: "X19467537",
      label: "Fidelity Brokerage",
      isNew: false,
    });
  });

  it("previews the thinkorswim 260727 Total Cost layout", async () => {
    uploadRouteMocks.account.findUnique.mockResolvedValueOnce(null);
    uploadRouteMocks.account.upsert.mockResolvedValueOnce({
      id: "acct-53",
      accountId: "D-68011053",
      label: "thinkorswim D-68011053",
      displayLabel: null,
    });
    uploadRouteMocks.import.create.mockResolvedValueOnce({ id: "import-53" });

    const csv = [
      "This document was exported from the paperMoney platform.",
      "Account Statement for D-68011053 (margin) since 7/21/26 through 7/27/26",
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Total Cost,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type",
      ",7/23/26 13:51:50,SINGLE,SELL,-2,0.00,TO CLOSE,D,18 SEP 26,65,CALL,7.25,7.25,LMT",
    ].join("\n");

    const { POST } = await import("./route");
    const response = await POST(buildCsvUploadRequest("2026-07-27-AccountStatement53.csv", csv));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      importId: "import-53",
      account: {
        accountId: "D-68011053",
        isNew: true,
      },
      detection: {
        adapterId: "schwab_thinkorswim",
      },
      previewRows: [
        {
          symbol: "D",
          side: "SELL",
          quantity: 2,
          price: 7.25,
          openingClosingEffect: "TO_CLOSE",
        },
      ],
    });
  });
});
