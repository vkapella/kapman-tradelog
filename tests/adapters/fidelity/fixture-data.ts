const HEADER =
  "Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date";

export const FIXTURE_ACCOUNT_ID = "T12345678";
export const FIXTURE_FILENAME_8 = `History_for_Account_${FIXTURE_ACCOUNT_ID}-8.csv`;
export const FIXTURE_FILENAME_9 = `History_for_Account_${FIXTURE_ACCOUNT_ID}-9.csv`;
export const FIXTURE_FILENAME_10 = `History_for_Account_${FIXTURE_ACCOUNT_ID}-10.csv`;
export const FIXTURE_FILENAME_11 = `History_for_Account_${FIXTURE_ACCOUNT_ID}-11.csv`;

function buildCsv(rows: string[]): string {
  return [`History for Account ${FIXTURE_ACCOUNT_ID}`, "Generated for tests", HEADER, ...rows].join("\n");
}

const FIXTURE_TEXT_BY_FILENAME: Record<string, string> = {
  [FIXTURE_FILENAME_8]: `\uFEFF${buildCsv([
    "12/23/2025,YOU SOLD CLOSING TRANSACTION, -NTAP260220C115,NTAP CALL CLOSE,Margin,3,-1,0,0,,300,10000,12/24/2025",
    "03/13/2026,ASSIGNED as of Mar-13-2026 PUT (DAL) DELTA AIR LINES INC MAY 16 26 $65 (100 SHS) (Cash),-DAL260516P65,PUT (DAL) DELTA AIR LINES INC MAY 16 26 $65 (100 SHS),Cash,,1,0,0,,0,1000,03/14/2026",
    "03/13/2026,YOU BOUGHT ASSIGNED PUTS AS OF 03-13-26 DELTA AIR LINES INC (DAL) (Cash),DAL,DELTA AIR LINES INC,Cash,65,100,0,0,,-6500,-5500,03/14/2026",
    "01/04/2026,YOU BOUGHT OPENING TRANSACTION,-PLTR260220C150,PLTR CALL OPEN,Margin,2.5,1,0,0,,-250,9750,01/06/2026",
    "01/05/2026,YOU SOLD OPENING TRANSACTION,-QQQM260417P250,QQQM PUT OPEN,Margin,1.25,-1,0,0,,125,9875,01/07/2026",
    "01/06/2026,DIVIDEND RECEIVED FIDELITY GOVERNMENT MONEY MARKET,SPAXX,Fidelity Government Money Market,Cash,,0,,,,1.23,9876.23,01/06/2026",
    "01/07/2026,BUY CANCEL CLOSING TRANSACTION CXL DESCRIPTION CANCELLED TRADE,-INTC260117C23,cancelled,Margin,1,-1,0,0,,100,9976.23,01/08/2026",
    "01/08/2026,TRANSFERRED FROM CORE ACCOUNT,SPAXX,Core transfer in,Cash,,0,,,,100,10076.23,01/08/2026",
  ])}`,
  [FIXTURE_FILENAME_9]: buildCsv([
    "03/13/2026,ASSIGNED as of Mar-13-2026 PUT (INTC) INTEL CORP JUN 20 25 $25 (100 SHS) (Cash),-INTC250620C25,INTC ASSIGNMENT OPTION,Cash,,1,0,0,,0,5000,03/14/2026",
    "03/13/2026,YOU BOUGHT ASSIGNED PUTS AS OF 03-13-26 INTEL CORP COM USD0.001 (INTC) (Cash),INTC,INTEL CORP COM USD0.001,Cash,25,100,0,0,,-2500,2500,03/14/2026",
    "02/01/2026,YOU BOUGHT CLOSING TRANSACTION,-SHEL260417C87.5,SHEL CALL CLOSE,Margin,4.5,1,0,0,,-450,2050,02/03/2026",
    "02/02/2026,REINVESTMENT,SPAXX,Dividend reinvestment,Cash,,0,,,,5,2055,02/02/2026",
    "02/03/2026,REDEMPTION FROM CORE ACCOUNT,SPAXX,Core redemption,Cash,,0,,,,-5,2050,02/03/2026",
    "02/04/2026,TRANSFER OF ASSETS ACAT RECEIVE,CSCO,ACAT receive,Cash,,0,,,,0,2050,02/04/2026",
    "02/05/2026,TRANSFER OF ASSETS ACAT RES.CREDIT,CSCO,ACAT credit,Cash,,0,,,,0,2050,02/05/2026",
  ]),
  [FIXTURE_FILENAME_10]: buildCsv([
    "01/05/2026,YOU SOLD OPENING TRANSACTION,-QQQM260417P250,QQQM PUT OPEN,Margin,1.25,-1,0,0,,125,9875,01/07/2026",
    "01/06/2026,YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER,SPAXX,Fidelity Government Money Market,Cash,1,10,0,0,,-10,9865,01/06/2026",
    "01/06/2026,YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER,FSIXX,Fidelity Treasury Money Market,Cash,1,15,0,0,,-15,9850,01/06/2026",
    "01/07/2026,YOU BOUGHT ISHARES TR MSCI USA MMENTM,MTUM,ISHARES TR MSCI USA MMENTM,Cash,220,5,0,0,,-1100,8750,01/09/2026",
    "01/08/2026,YOU SOLD SELECT SECTOR SPDR TRUST,XLE,SELECT SECTOR SPDR TRUST,Cash,90,-3,0,0,,270,9020,01/10/2026",
    "01/09/2026,UNMAPPED FIDELITY ACTION,XYZ,Unknown action,Cash,10,1,0,0,,-10,9010,01/11/2026",
    "01/10/2026,BUY CANCEL CLOSING TRANSACTION CXL DESCRIPTION CANCELLED TRADE,-INTC260117C23,cancelled,Margin,1,-1,0,0,,100,9110,01/12/2026",
    ",,,,,,,,,,,,",
  ]),
  [FIXTURE_FILENAME_11]: buildCsv([
    '04/16/2026,"YOU BOUGHT OPENING TRANSACTION CALL (MU) MICRON TECHNOLOGY JUN 18 26 $450 (100 SHS) (Margin)", -MU260618C450,"CALL (MU) MICRON TECHNOLOGY JUN 18 26 $450 (100 SHS)",Margin,63.26,1,,0.02,,-6326.02,Processing,04/17/2026',
    '04/16/2026,"YOU SOLD OPENING TRANSACTION CALL (MU) MICRON TECHNOLOGY JUN 18 26 $500 (100 SHS) (Margin)", -MU260618C500,"CALL (MU) MICRON TECHNOLOGY JUN 18 26 $500 (100 SHS)",Margin,42.95,-1,,0.11,,4294.89,Processing,04/17/2026',
    '04/10/2026,"REDEMPTION FROM CORE ACCOUNT FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,1,-13090.54,,,,13090.54,0.00,',
    "",
    "",
    '"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution. The spreadsheet is provided for"',
    '"informational purposes only, and is not intended to provide advice, nor should it be construed as an offer to sell, a solicitation of an offer to buy or a"',
    "",
    "Date downloaded 04/16/2026 7:53 pm",
  ]),
};

export function loadFixtureCsvText(filename: string): string {
  const value = FIXTURE_TEXT_BY_FILENAME[filename];
  if (!value) {
    throw new Error(`Unknown Fidelity fixture '${filename}'.`);
  }

  return value;
}

export function loadFixtureBuffer(filename: string): Buffer {
  return Buffer.from(loadFixtureCsvText(filename), "utf8");
}
