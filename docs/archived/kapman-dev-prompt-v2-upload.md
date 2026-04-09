# KapMan Trading Journal — Complete Development Prompt with File Upload

## Project Overview
Build a comprehensive, single-page web application for analyzing paper trading performance from TD Ameritrade thinkorswim paperMoney® CSV exports. The journal must support multiple accounts, calculate complex metrics like average holding time and trade volume, display open positions, and **allow incremental data uploads with full CSV parsing, deduplication, FIFO recalculation, and UI refresh**.

---

## Core Requirements

### 1. Data Import & Structure

**File Format Support:**
- **Primary:** TD Ameritrade / thinkorswim paperMoney® CSV statements
- **Future:** Fidelity format (stub UI, not yet implemented)

**CSV Parsing Requirements:**
- Parse transaction lines with type `TRD` (trades only, ignore deposits/withdrawals)
- Extract from description field:
  - Action: `BOT` → BUY, `SOLD` → SELL
  - Symbol: ticker (e.g., BWXT, AMZN, SDS)
  - Type: CALL, PUT, STOCK, or SPREAD (diagonal options)
  - Quantity: integer (convert +/- to absolute value)
  - Strike price: decimal for options (e.g., 160, 230)
  - Expiry date: parse from "DD MMM YY" format (e.g., "21 NOV 25" → "NOV 21, 2025")
  - Entry price: decimal after `@` symbol

**Example thinkorswim CSV line:**
```
9/2/25,11:19:29,TRD,="5.229435487e+09",BOT +4 BWXT 100 21 NOV 25 160 CALL @10.85,-0.02,-2.60,"-4,340.00","95,657.38"
```

**Parsed output:**
```json
{
  "id": "5.229435487",
  "account": "D-68011053",
  "datetime": "2025-09-02T11:19:29",
  "date": "2025-09-02",
  "time": "11:19:29",
  "action": "BUY",
  "symbol": "BWXT",
  "opt_type": "CALL",
  "qty": 4,
  "strike": "160",
  "expiry": "NOV 21, 2025",
  "price": 10.85,
  "fees": 2.62,
  "amount": -4340.00,
  "acct_balance": 95657.38,
  "description": "BOT +4 BWXT 100 21 NOV 25 160 CALL @10.85",
  "holding_days": ""
}
```

### 2. Multi-Account Support

**Starting Balances:**
- Each account starts with $100,000
- Combined portfolio entry balance: $200,000
- Equity curve must start at this initial balance (day before first trade)

**Account Tracking:**
- Track individual account balances from `acct_balance` field in CSV
- Calculate combined portfolio balance = sum of all accounts
- Forward-fill equity for non-trading days
- Display separate + combined equity curves on Accounts page

### 3. Position Tracking & Holding Time Calculation

**FIFO Matching Algorithm:**
- Match BUY→SELL pairs using FIFO (First In, First Out)
- Key = (account, symbol, option_type, strike, expiry)
- When action flips (BUY queue sees SELL or vice versa):
  - Match quantity from oldest open position
  - Calculate holding days = (close_date - open_date).days
  - Store holding_days in the closing trade
  - Reduce or remove matched open position quantity

**Open Positions:**
- After processing all trades, positions with qty > 0 are open
- Display: account, symbol, type, strike, expiry, action, qty, open_date, days_held
- **NLV Stub:** Show notice that Net Liquidation Value requires live market data feed

**Example matching:**
```
BUY 5 BWXT 160C NOV21 @ $10.85 on Sept 2
SELL 3 BWXT 160C NOV21 @ $12.40 on Sept 15
→ 3 contracts closed, holding_days = 13
→ 2 contracts remain open
```

### 4. Trade Volume Metrics

**Definition:** A "trade" = one individual BUY or SELL execution (not round-trip)

**Required Metrics:**
- Total trades (count all BUY + SELL transactions)
- Trading days (unique dates with ≥1 trade)
- **Avg trades per day** = total_trades / trading_days
- **Peak daily volume** = max trades on any single day
- Trades per day distribution (histogram: 1-12 trades, >12)
- Daily volume over time (bar chart by date)
- Top 20 busiest trading days (sorted by trade count descending)

### 5. Holding Time Metrics

**Required Metrics:**
- **Avg holding days** = mean of all matched open→close pairs
- Max holding time = longest duration from any closed position
- Same-day closes = count of positions opened & closed on same day (holding_days = 0)
- Holding time distribution:
  - 0 (same-day)
  - 1-7 days
  - 8-14 days
  - 15-30 days
  - 31-60 days
  - 60+ days

---

## File Upload Implementation

### Upload Modal UI
**Location:** Sidebar → "Upload Data" menu item

**Modal Components:**
1. **Info Notice (blue):** "📊 Upload additional trade data from your broker..."
2. **Broker Format Dropdown:**
   - TD Ameritrade / thinkorswim (paperMoney®) — active
   - Fidelity — grayed out "(Coming Soon)"
3. **Account Selector Dropdown:**
   - Create New Account (generates D-xxxxxxxx)
   - List all existing accounts dynamically
4. **File Upload Area:**
   - Drag & drop or click to select
   - Accept only `.csv` files
   - Display selected filename with ✓ checkmark
5. **Progress Bar (hidden until upload starts):**
   - Animated fill from 0% → 100%
   - Status text: "Reading file..." → "Parsing trades..." → "Recalculating metrics..." → "Complete!"
6. **Result Notice (hidden until complete):**
   - Success (green): "✅ Successfully imported X new trades (Y duplicates skipped)"
   - Error (red): "Error: [message]"
   - Warning (yellow): "All X trades already exist"
7. **Action Buttons:**
   - Cancel (secondary) — close modal, reset state
   - Import Trades (primary) — trigger upload process

### Upload Process Flow

**Step 1: File Selection**
```javascript
function handleFileSelect(input) {
  if (input.files.length > 0) {
    selectedFile = input.files[0];
    document.getElementById('fileName').textContent = '✓ ' + selectedFile.name;
  }
}
```

**Step 2: Validation**
- Check file is selected
- Check broker format (reject if Fidelity)
- Get selected account ID or generate new one

**Step 3: Read CSV via FileReader**
```javascript
const reader = new FileReader();
reader.onload = function(e) {
  const csvText = e.target.result;
  // Process...
};
reader.readAsText(selectedFile);
```

**Step 4: Parse CSV**
Use regex-based parser to extract trades from CSV text:

```javascript
function parseThinkorswimCSV(csvText, accountId) {
  const lines = csvText.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const trades = [];

  for (let i = 1; i < lines.length; i++) {
    // Match CSV cells (handles quoted commas)
    const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ? values[idx].replace(/"/g, '').trim() : '';
    });

    // Filter: TYPE === 'TRD'
    if (row['TYPE'] !== 'TRD') continue;

    const desc = row['DESCRIPTION'] || '';
    if (!desc.includes('BOT') && !desc.includes('SOLD')) continue;

    // Extract action
    const action = desc.includes('BOT') ? 'BUY' : 'SELL';

    // Extract symbol (word after BOT/SOLD + 1)
    const parts = desc.split(/\s+/);
    let symbol = '';
    for (let j = 0; j < parts.length; j++) {
      if (parts[j] === 'BOT' || parts[j] === 'SOLD') {
        if (j + 2 < parts.length) symbol = parts[j + 2];
        break;
      }
    }

    // Determine type
    let opt_type = '';
    if (desc.includes('CALL')) opt_type = 'CALL';
    else if (desc.includes('PUT')) opt_type = 'PUT';
    else if (desc.includes('DIAGONAL')) opt_type = 'SPREAD';
    else opt_type = 'STOCK';

    // Extract strike (number before CALL/PUT)
    let strike = '';
    if (opt_type === 'CALL' || opt_type === 'PUT') {
      const strikeMatch = desc.match(/(\d+\.?\d*)\s+(CALL|PUT)/);
      if (strikeMatch) strike = strikeMatch[1];
    }

    // Extract expiry (DD MMM YY format)
    let expiry = '';
    if (opt_type === 'CALL' || opt_type === 'PUT') {
      const expiryMatch = desc.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{2})/);
      if (expiryMatch) {
        const [_, day, mon, yr] = expiryMatch;
        const monMap = {'JAN':'01','FEB':'02','MAR':'03','APR':'04','MAY':'05','JUN':'06',
                       'JUL':'07','AUG':'08','SEP':'09','OCT':'10','NOV':'11','DEC':'12'};
        expiry = `${mon} ${day.padStart(2,'0')}, 20${yr}`;
      }
    }

    // Extract quantity
    const qtyMatch = desc.match(/[+-](\d+)/);
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 0;

    // Extract price
    const priceMatch = desc.match(/@([\d.]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

    // Parse fees
    const miscFees = parseFloat(row['MISC FEES'] || 0);
    const commFees = parseFloat(row['COMMISSIONS & FEES'] || 0);
    const fees = Math.abs(miscFees) + Math.abs(commFees);

    const amount = parseFloat(row['AMOUNT'] || 0);
    const balance = parseFloat(row['BALANCE'] || 0);

    const dateStr = row['DATE'] || '';
    const timeStr = row['TIME'] || '';
    const datetime = `${dateStr} ${timeStr}`;

    const refNum = (row['REF #'] || '').replace(/=/g, '').replace(/"/g, '');

    trades.push({
      id: refNum,
      account: accountId,
      datetime, date: dateStr, time: timeStr,
      action, symbol, opt_type, qty, strike, expiry, price, fees, amount,
      acct_balance: balance,
      combined_balance: balance,
      description: desc,
      holding_days: ''
    });
  }

  return trades;
}
```

**Step 5: Deduplication**
- Create set of existing trade keys: `${id}|${datetime}`
- Filter new trades to exclude duplicates
- Report duplicate count to user

```javascript
const existingKeys = new Set(TRADES.map(t => `${t.id}|${t.datetime}`));
const uniqueNewTrades = newTrades.filter(t => 
  !existingKeys.has(`${t.id}|${t.datetime}`)
);
```

**Step 6: Merge & Recalculate**
```javascript
// Add unique trades to global TRADES array
TRADES.push(...uniqueNewTrades);

// Trigger full recalculation
recalculateAll();

function recalculateAll() {
  // 1. Sort trades chronologically
  TRADES.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  // 2. Update combined balances
  updateCombinedBalances();

  // 3. Calculate FIFO and open positions
  OPEN_POS = calculateFIFO();

  // 4. Recalculate STATS, EQUITY, SYM_PNL, MONTHLY, DAILY_PNL, TPD
  // ... (see implementation details below)

  // 5. Update account filter dropdowns
  updateAccountFilter();

  // 6. Update UI element counts
  document.getElementById('open-count').textContent = OPEN_POS.length;
}
```

**Step 7: UI Refresh**
- Rebuild all charts (call chart destroy then recreate)
- Re-render current page (dashboard, analytics, etc.)
- Navigate to Trade Log to show new data

```javascript
function rebuildAll() {
  const activePage = document.querySelector('.pg.on')?.id.replace('pg-','');
  if (activePage === 'dashboard') initDash();
  if (activePage === 'analytics') initAnalytics();
  if (activePage === 'volume') initVolume();
  if (activePage === 'accounts') initAccounts();
}

// After upload complete
setTimeout(() => {
  rebuildAll();
  closeUploadModal();
  nav('trades'); // Navigate to trade log
}, 1500);
```

### Error Handling

**Validation Errors (show before file read):**
- No file selected → "Please select a file"
- Fidelity format → "Fidelity format is not yet implemented"

**Parsing Errors (show after file read):**
- Empty file → "No valid trades found in file"
- Malformed CSV → "Error parsing CSV: [details]"
- All duplicates → "All X trades already exist (duplicates skipped)" (warning, not error)

**Display Errors:**
```javascript
function showUploadResult(message, type) {
  const resultDiv = document.getElementById('upload-result');
  resultDiv.style.display = 'block';
  resultDiv.className = `notice notice-${type}`; // 'success', 'error', 'warn'
  resultDiv.textContent = message;
}
```

### Progress Updates

**Progress Bar with Status Text:**
```javascript
function setProgress(pct, status) {
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('upload-status').textContent = status;
}

// Usage in upload flow:
setProgress(0, 'Reading file...');
setProgress(30, 'Parsing trades...');
setProgress(60, `Found ${newTrades.length} trades...`);
setProgress(80, 'Recalculating metrics...');
setProgress(100, 'Complete!');
```

### New Account Generation

**When user selects "Create New Account":**
```javascript
if (accountId === 'new') {
  const num = Math.floor(Math.random() * 90000000) + 10000000;
  accountId = `D-${num}`; // e.g., D-68011053
  ACCOUNTS.add(accountId); // Add to global set
}
```

**Update Dropdowns:**
After adding account, refresh both:
1. Trade Log filter dropdown (`#fAcct`)
2. Upload modal account selector (`#uploadAcct`)

```javascript
function updateAccountFilter() {
  const filterSel = document.getElementById('fAcct');
  filterSel.innerHTML = '<option value="">All Accounts</option>' + 
    [...ACCOUNTS].map(a => `<option>${a}</option>`).join('');

  const uploadSel = document.getElementById('uploadAcct');
  uploadSel.innerHTML = '<option value="new">Create New Account</option>' + 
    [...ACCOUNTS].map(a => `<option value="${a}">${a}</option>`).join('');
}
```

---

## User Interface Requirements

### Navigation Structure
**Sidebar (left, 220px, collapsible on mobile):**
1. Dashboard — summary KPIs + combined equity curve
2. Trade Log — filterable table, pagination, strike/expiry visible
3. Open Positions — current holdings, days held, NLV notice
4. Analytics — win rate, profit factor, symbol P&L, pie charts
5. Volume & Holding — trade volume + holding time visualizations
6. Calendar — heatmap of daily P&L, click to see trade detail
7. Accounts — individual + combined equity curves (3 lines, toggleable)
8. **Upload Data** — modal for incremental CSV import

### Dashboard Page
**KPI Cards (9 total):**
1. Portfolio Balance — combined end balance ($)
2. Net P&L — dollar amount + % return on $200K
3. Open Positions — count of contracts held
4. Total Trades — BUY + SELL count
5. Trading Days — days with ≥1 trade
6. **Avg Trades / Day** — per active day
7. **Avg Holding Time** — matched pairs only (days)
8. Symbols Traded — unique ticker count
9. Best Symbol — top winner by P&L

**Charts:**
- Combined Portfolio Equity Curve (line chart, starts at $200K)
- Monthly P&L (bar chart, green/red by profitability)
- P&L by Day of Week (Mon-Fri bar chart)

**Recent Trades Table (last 20):**
- Date/Time, Account, Action, Symbol, Type, Strike, Expiry, Amount, Portfolio Balance

### Trade Log Page
**Features:**
- Search box (filters symbol + description)
- Dropdown filters: Account, Action (BUY/SELL), Type (CALL/PUT/STOCK/SPREAD)
- **Page size selector:** 25 / 50 / 100 / Show All
- Pagination (hide if "Show All" selected)
- **Columns:** ID, Date, Time, Acct, Action, Symbol, Type, Qty, Strike, Expiry, @Price, Fees, Amount, Acct Bal, Portfolio Bal, Held (days)

**Strike & Expiry Display:**
- Strike: monospace font, 10px, e.g., "160", "230"
- Expiry: monospace font, 9px, muted color, e.g., "NOV 21, 2025"
- Show "—" if field is empty (stock trades)

### Open Positions Page
**Notice Box (warning style):**
> ⚠ Net Liquidation Value (NLV) calculation requires real-time market data. This view shows position quantities only. Connect to a live data feed to see current market values.

**Table Columns:**
- Account, Symbol, Type, Strike, Expiry, Action, Qty, Open Date, Days Held

### Volume & Holding Page
**KPI Cards (6 total):**
1. Active Trading Days
2. **Avg Trades / Day**
3. **Peak Daily Volume**
4. **Avg Holding Time** (days)
5. **Max Holding Time** (days)
6. **Same-Day Closes** (count)

**Charts:**
- Trades Per Day Distribution (histogram)
- Holding Time Distribution (histogram with 6 buckets)
- Daily Trade Volume Over Time (bar chart, chronological)
- Top 20 Busiest Trading Days (horizontal bar list)

### Accounts Page
**Features:**
- **3-line chart with toggleable legend:**
  - D-68011053 (blue line)
  - D-68011054 (purple line)
  - **Combined** (teal line, bold)
- Click legend items to show/hide lines
- Individual account stats cards (trades, P&L, fees)

---

## Technical Specifications

### Technology Stack
- **Single HTML file** (no build tools)
- **Vanilla JavaScript** (ES6+, no frameworks)
- **Chart.js 4.4.0** for all charts (via CDN)
- **CSS Custom Properties** for theming
- **Responsive design** (mobile-first, 375px → desktop)
- **FileReader API** for CSV upload

### Data Structure
```javascript
// Global state (mutable, updated by file upload)
let TRADES = [...]; // All parsed trades
let EQUITY = [{date, acct1, acct2, combined}, ...];
let SYM_PNL = [['SYM', pnl], ...]; // Sorted by P&L
let MONTHLY = {'2025-09': 1234.56, ...};
let DAILY_PNL = {'2025-09-02': 567.89, ...};
let TPD = {'2025-09-02': 8, ...}; // Trades per day
let STATS = {total_trades, avg_trades_per_day, avg_holding_days, ...};
let OPEN_POS = [{account, symbol, type, strike, expiry, action, qty, open_date}, ...];
let ACCOUNTS = new Set(['D-68011053', 'D-68011054']); // Dynamic account list
```

### Color Palette (Nexus Design System)
**Light Mode:**
- Background: `#f3f2ef`
- Surface: `#f9f8f6`
- Text: `#1c1a16`
- Primary (teal): `#016b70`
- Green (profit): `#267a18`
- Red (loss): `#a31e1e`

**Dark Mode:**
- Background: `#0e0d0b`
- Surface: `#151412`
- Text: `#d6d4d0`
- Primary (teal): `#4d99a5`
- Green (profit): `#55b040`
- Red (loss): `#dd5252`

### Chart.js Configuration
**Common options:**
- Responsive: true
- Maintain aspect ratio: false
- Theme-aware colors: use CSS custom properties via `getComputedStyle()`
- Tooltips: styled with surface color + border
- Legend: hide on most charts (except Accounts page)

**Accounts Chart (toggleable legend):**
```javascript
plugins: {
  legend: {
    labels: { color: cs().tc },
    onClick: (e, item, legend) => {
      const i = item.datasetIndex;
      const ci = legend.chart;
      ci.isDatasetVisible(i) ? ci.hide(i) : ci.show(i);
      ci.update();
    }
  }
}
```

### Performance Optimizations
- Lazy render: only build charts when page is visited
- Destroy charts before rebuild on theme toggle
- Pagination for trade log (default 50 per page)
- Forward-fill equity (don't recalculate daily)
- FileReader progress events for large CSV files

---

## User Stories

### Epic 1: Data Import & Parsing
**As a** trader,
**I want to** upload my thinkorswim CSV statement,
**So that** I can analyze my paper trading history without manual data entry.

**Acceptance Criteria:**
- Parse transaction lines with `TRD` type
- Extract symbol, action, type, qty, strike, expiry, price from description
- Handle stock trades (no strike/expiry)
- Handle option trades (CALL, PUT)
- Handle spread trades (DIAGONAL label)
- Store fees (misc + commission)
- Store account balance after each trade

---

### Epic 2: Multi-Account Aggregation
**As a** trader with multiple accounts,
**I want to** see my combined portfolio performance,
**So that** I can track my total P&L across all accounts.

**Acceptance Criteria:**
- Each account starts at $100,000
- Combined portfolio starts at $200,000
- Equity curve includes entry balance (day before first trade)
- Combined balance = sum of individual accounts
- Dashboard shows combined metrics
- Accounts page shows individual + combined lines

---

### Epic 3: Position & Holding Time Tracking
**As a** trader,
**I want to** see how long I hold positions on average,
**So that** I can understand my trading time horizon.

**Acceptance Criteria:**
- Match BUY→SELL pairs using FIFO by (account, symbol, type, strike, expiry)
- Calculate holding days for each closed position
- Display "Held (days)" column in trade log
- Show "Avg Holding Time" KPI on Dashboard
- Show holding time distribution histogram on Volume page
- Track open positions (unmatched buys)
- Display open positions with days held from open_date to now

---

### Epic 4: Trade Volume Analysis
**As a** trader,
**I want to** see my daily trading activity patterns,
**So that** I can identify overtrading or undertrading days.

**Acceptance Criteria:**
- Count every BUY + SELL as one trade
- Calculate avg trades per day (total / trading days)
- Show peak daily volume
- Display "Trades Per Day Distribution" histogram
- Display "Daily Trade Volume Over Time" bar chart
- List "Top 20 Busiest Trading Days"

---

### Epic 5: Trade Log with Strike/Expiry
**As a** trader,
**I want to** see strike prices and expiration dates in my trade log,
**So that** I can identify which specific contracts I traded.

**Acceptance Criteria:**
- Strike column shows decimal (e.g., "160", "230") for options, "—" for stocks
- Expiry column shows formatted date (e.g., "NOV 21, 2025") for options, "—" for stocks
- Columns are sortable (future enhancement)
- Monospace font for numeric data (strike, price, fees)
- Mobile-responsive (horizontal scroll if needed)

---

### Epic 6: Pagination & Page Size Control
**As a** trader,
**I want to** choose how many trades to see per page,
**So that** I can quickly scan all trades or focus on a subset.

**Acceptance Criteria:**
- Page size dropdown: 25 / 50 / 100 / Show All
- Default: 50 per page
- Pagination controls: ‹ prev | page numbers | next ›
- Hide pagination when "Show All" is selected
- Maintain filters when changing page size

---

### Epic 7: Open Positions Dashboard
**As a** trader,
**I want to** see all my currently open positions,
**So that** I know what I'm holding and for how long.

**Acceptance Criteria:**
- Display all positions with qty > 0 after FIFO matching
- Show: account, symbol, type, strike, expiry, action, qty, open_date, days_held
- Calculate days_held = (today - open_date).days
- Display notice about NLV requiring live data
- No P&L calculation (requires market prices)

---

### Epic 8: Accounts Page with Toggleable Lines
**As a** trader,
**I want to** toggle individual account lines on the equity chart,
**So that** I can focus on one account or compare them.

**Acceptance Criteria:**
- Chart shows 3 datasets: Account 1, Account 2, Combined
- Combined line is bold (2.5px width)
- Legend is interactive (click to show/hide)
- Chart updates immediately when line is toggled
- At least one line must remain visible

---

### Epic 9: File Upload with Real CSV Parsing ✅ IMPLEMENTED
**As a** trader,
**I want to** upload additional CSV statements over time,
**So that** I can keep my journal up to date.

**Acceptance Criteria:**
- Modal opens when "Upload Data" is clicked in sidebar
- Broker format dropdown (thinkorswim active, Fidelity disabled)
- Account selector (existing accounts + "Create New")
- Drag & drop file upload area
- Show selected filename with checkmark
- **FileReader API reads CSV text**
- **Regex-based parser extracts trades**
- **Deduplication by ID + datetime**
- **Merge unique trades into TRADES array**
- **Trigger recalculateAll() to update all metrics**
- **Rebuild all charts**
- **Navigate to Trade Log showing new data**
- Progress bar with status updates (0% → 30% → 60% → 80% → 100%)
- Success/error notices with trade counts
- Generate new account ID if "Create New" selected

---

### Epic 10: Theme Toggle (Light/Dark)
**As a** trader,
**I want to** switch between light and dark mode,
**So that** I can use the app comfortably in different lighting conditions.

**Acceptance Criteria:**
- Toggle button in sidebar footer
- Icon changes: moon (dark) ↔ sun (light)
- All colors update via CSS custom properties
- Charts rebuild with new colors
- Default: dark mode

---

## Development Prompt (Copy-Paste Ready)

```
Build a single-page trading journal web application with the following specifications:

**Input:** TD Ameritrade thinkorswim paperMoney® CSV exports (multiple files, multiple accounts)

**Output:** Interactive dashboard with 7 pages:
1. Dashboard — KPIs + combined equity curve starting at $200K
2. Trade Log — filterable table with pagination (25/50/100/all), strike & expiry visible
3. Open Positions — current holdings with days held, NLV notice
4. Analytics — win rate, profit factor, symbol P&L charts
5. Volume & Holding — trade volume + holding time metrics & charts
6. Calendar — daily P&L heatmap
7. Accounts — individual + combined equity curves (3 lines, toggleable legend)

**File Upload (REQUIRED):**
- Modal UI with drag & drop file selection
- FileReader API to read CSV as text
- Regex-based parser to extract trades:
  - Match: /(".*?"|[^,]+)(?=\s*,|\s*$)/g for cells
  - Filter: TYPE === 'TRD'
  - Extract action: BOT → BUY, SOLD → SELL
  - Extract symbol: word after BOT/SOLD + 1
  - Extract type: CALL/PUT/STOCK/DIAGONAL → SPREAD
  - Extract strike: /(\d+\.?\d*)\s+(CALL|PUT)/
  - Extract expiry: /(\d{1,2})\s+([A-Z]{3})\s+(\d{2})/ → format as "MON DD, 20YY"
  - Extract qty: /[+-](\d+)/
  - Extract price: /@([\d.]+)/
- Deduplication: filter by `${id}|${datetime}` against existing TRADES
- Merge: TRADES.push(...uniqueNewTrades)
- Recalculate:
  1. Sort trades chronologically
  2. Update combined balances (sum across accounts)
  3. FIFO matching → OPEN_POS
  4. Recalc STATS, EQUITY (forward-fill), SYM_PNL, MONTHLY, DAILY_PNL, TPD
  5. Update dropdowns
  6. Rebuild all charts (destroy + recreate)
  7. Navigate to Trade Log
- Progress bar: 0% → 30% → 60% → 80% → 100% with status text
- Success notice: "✅ Successfully imported X new trades (Y duplicates skipped)"
- Error handling: show error message, disable import button during processing

**Key Metrics:**
- Average Trades Per Day = total_trades / trading_days
- Average Holding Time = mean of FIFO-matched open→close pairs (days)
- Open Positions = unmatched BUY quantities after FIFO processing

**CSV Parsing:**
- Extract from TRD lines: action (BOT/SOLD), symbol, type (CALL/PUT/STOCK/SPREAD), qty, strike, expiry (DD MMM YY format), price (@), fees
- Example: "BOT +4 BWXT 100 21 NOV 25 160 CALL @10.85" → BUY 4 BWXT CALL strike=160 expiry=NOV 21, 2025 price=10.85

**FIFO Matching:**
- Key = (account, symbol, opt_type, strike, expiry)
- Match BUY→SELL chronologically, calculate holding_days
- Remaining qty > 0 = open positions

**Technical:**
- Single HTML file, vanilla JS, Chart.js 4.4.0, FileReader API
- Nexus color palette (warm beige surfaces, teal accent)
- Light/dark mode toggle
- Mobile-responsive (375px+)
- Global state: TRADES, EQUITY, SYM_PNL, MONTHLY, DAILY_PNL, TPD, STATS, OPEN_POS, ACCOUNTS (Set)

**UI Components:**
- Sidebar navigation (220px, 8 items)
- KPI cards (responsive grid, 160px min width)
- Charts (Chart.js, theme-aware, tooltips styled)
- Tables (sticky header, hover rows, pagination)
- Modal (file upload, broker selector, account selector, progress bar, result notice)

Generate complete HTML with embedded CSS and JavaScript. No external dependencies except Chart.js CDN.
```

---

## Testing Checklist

### Data Integrity
- [ ] All trades parsed correctly
- [ ] Strike prices populated for options
- [ ] Expiry dates formatted correctly
- [ ] Account balances forward-filled for non-trading days
- [ ] Combined portfolio starts at $200,000

### Calculations
- [ ] Avg holding time calculated from FIFO matching
- [ ] Avg trades per day = total / trading_days
- [ ] Open positions = unmatched FIFO quantities
- [ ] Win rate calculation correct
- [ ] Profit factor calculation correct

### File Upload
- [ ] Modal opens/closes correctly
- [ ] File selection shows filename with ✓
- [ ] CSV parsing handles quoted commas
- [ ] Deduplication prevents duplicate trades
- [ ] Progress bar updates (0% → 100%)
- [ ] Success notice shows correct counts
- [ ] Error notice shows on parsing failure
- [ ] New account generation works (D-xxxxxxxx)
- [ ] Account dropdowns update after upload
- [ ] recalculateAll() updates all metrics
- [ ] All charts rebuild after upload
- [ ] Navigation to Trade Log works
- [ ] Upload with all duplicates shows warning

### UI/UX
- [ ] All 7 pages navigate correctly
- [ ] Theme toggle works (light ↔ dark)
- [ ] Charts rebuild on theme change
- [ ] Pagination works (prev/next/page numbers)
- [ ] Page size selector changes display
- [ ] "Show All" hides pagination
- [ ] Filters apply correctly (search, account, action, type)
- [ ] Upload modal opens/closes
- [ ] Accounts chart legend toggles lines
- [ ] Calendar day click shows trade detail
- [ ] Mobile responsive (sidebar collapses)

### Performance
- [ ] Page loads < 2 seconds
- [ ] Chart rendering < 500ms
- [ ] No memory leaks on page switch
- [ ] Smooth scrolling in trade log
- [ ] Large CSV (1000+ trades) uploads < 5 seconds

---

## Future Enhancements

### Phase 2: Real Data Integration
- Connect to market data API for live NLV calculation
- Auto-refresh open positions every 15 minutes
- Display current market price vs. entry price
- Calculate unrealized P&L for open positions

### Phase 3: Advanced Analytics
- Trade streak analysis (consecutive wins/losses)
- Time of day performance (morning vs. afternoon)
- Symbol correlation matrix
- Risk-adjusted returns (Sharpe ratio, max drawdown)

### Phase 4: Fidelity Format Support
- Parse Fidelity CSV format
- Map Fidelity fields to standard trade object
- Add format auto-detection

### Phase 5: Export & Reporting
- Export filtered trades to CSV
- Generate PDF performance reports
- Share read-only dashboard link
- Email weekly summary

---

## Appendix: Sample Data Structure

### Trade Object
```json
{
  "id": "5.229435487",
  "account": "D-68011053",
  "datetime": "2025-09-02T11:19:29",
  "date": "2025-09-02",
  "time": "11:19:29",
  "action": "BUY",
  "symbol": "BWXT",
  "opt_type": "CALL",
  "qty": 4,
  "strike": "160",
  "expiry": "NOV 21, 2025",
  "price": 10.85,
  "fees": 2.62,
  "amount": -4340.00,
  "acct_balance": 95657.38,
  "combined_balance": 187423.15,
  "description": "BOT +4 BWXT 100 21 NOV 25 160 CALL @10.85",
  "holding_days": 13
}
```

### Open Position Object
```json
{
  "account": "D-68011053",
  "symbol": "SDS",
  "type": "STOCK",
  "strike": "",
  "expiry": "",
  "action": "BUY",
  "qty": 200,
  "open_date": "2025-09-18"
}
```

### Statistics Object
```json
{
  "total_trades": 396,
  "buy_trades": 198,
  "sell_trades": 198,
  "trading_days": 79,
  "avg_trades_per_day": "5.0",
  "avg_holding_days": "34.7",
  "unique_symbols": 45,
  "net_pnl": 12345.67,
  "end_balance": 212345.67,
  "return_pct": "6.17",
  "top_winner": "BWXT",
  "top_winner_pnl": 5678.90,
  "top_loser": "TSLA",
  "top_loser_pnl": -2345.67,
  "acct1_end": 106789.45,
  "acct2_end": 105556.22,
  "acct1_pnl": 6789.45,
  "acct2_pnl": 5556.22,
  "open_positions_count": 59
}
```

---

**End of Development Prompt**
