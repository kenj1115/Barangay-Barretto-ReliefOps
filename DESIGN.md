# Design System — Barangay Barretto ReliefOps

> **Source of Truth:** Extracted directly from all 8 Stitch screens in project `projects/13999572060531790438` (*Barangay Barretto ReliefOps Dashboard*).
> **Theme Polarity:** **Light Mode** (`bg-surface` `#F8FAFC`, `text-on-surface` `#0F172A`)
> **Visual Identity:** Maritime Navy (`#1E3A8A`) & Cool Canvas (`#F8FAFC`) — clean, civic, high-legibility BDRRMC operations interface with crisp hairline borders (`#E2E8F0`), semantic status pills, and tabular numerals.

---

## 1. Color Palette

### Core Brand & Semantic Accents
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `maritime-navy` / `primary` | `#1E3A8A` | Primary brand color, primary CTAs, active nav icon/text, Login/Portal headers |
| `cool-canvas` / `surface` | `#F8FAFC` | Application page background & subtle inset cards |
| `emerald-verified` | `#059669` | Live Sync indicator dot, healthy stock bar, verification checks |
| `amber-fifo` | `#D97706` | Expiring soon / Priority FIFO warning icon & progress bar |
| `crimson-alert` / `error` | `#DC2626` | Low-stock alert banner, critical stock bar, deny/error actions |

### Full Material-Mapped Surface & Text Tokens
| Token | Hex | Role |
| :--- | :--- | :--- |
| `primary` | `#1E3A8A` | Primary fill |
| `on-primary` | `#FFFFFF` | Text/icons on primary fill |
| `primary-container` | `#EFF0FF` | Active nav background, category/selected card tint |
| `on-primary-container` | `#00164E` | Text on primary-container |
| `secondary` | `#475569` | Secondary emphasis |
| `on-secondary` | `#FFFFFF` | Text on secondary |
| `secondary-container` | `#E2E8F0` | Secondary muted surface |
| `on-secondary-container` | `#1E293B` | Text on secondary-container |
| `success` | `#006C4A` | Positive numeric delta / success text |
| `on-success` | `#FFFFFF` | Text on success fill |
| `success-container` | `#ECFDF5` | Live sync badge, eligible/committed/healthy pills |
| `on-success-container` | `#002114` | Text on success-container |
| `warning` | `#904D00` | Warning text emphasis |
| `on-warning` | `#FFFFFF` | Text on warning fill |
| `warning-container` | `#FEF3C7` | Expiring soon, priority queue, rolled back pills |
| `on-warning-container` | `#2F1500` | Text on warning-container |
| `error` | `#DC2626` | Alert banner fill, destructive CTA |
| `on-error` | `#FFFFFF` | Text on error fill |
| `error-container` | `#FEF2F2` | Critical low stock, cooldown warning, denied pills |
| `on-error-container` | `#7F1D1D` | Text on error-container |
| `surface` | `#F8FAFC` | Main canvas background |
| `surface-container-lowest` | `#FFFFFF` | Cards, sidebar, tables, modals, inputs |
| `surface-container-low` | `#F1F5F9` | Table headers, table row hover, tab tracks |
| `surface-container` | `#E2E8F0` | Progress bar track background |
| `surface-container-high` | `#CBD5E1` | Higher emphasis divider/track |
| `on-surface` | `#0F172A` | Primary headings & body text |
| `on-surface-variant` | `#475569` | Secondary labels, subtitles, table headers |
| `outline` | `#64748B` | Strong borders |
| `outline-variant` | `#E2E8F0` | Hairline 1px borders on cards, tables, sidebar |
| `inverse-surface` | `#0F172A` | Dark inverse surface |
| `inverse-on-surface` | `#F8FAFC` | Text on inverse surface |

---

## 2. Typography

### Font Families
- **Display / Headline (`font-display`, `font-headline`):** `"Lato", sans-serif` (weight `700`)
- **UI Title / Body / Label (`font-title`, `font-body`, `font-label`):** `"Plus Jakarta Sans", sans-serif` (weights `400`, `500`, `600`, `700`)
- **Monospace (`font-mono`):** `"Source Code Pro", monospace` (weight `500`) — used for Claim IDs (`#CLM-215`), Household IDs (`#BRT-0482`), Batch numbers (`#BRT-04`), Transaction IDs (`TX-90482`), and timestamps
- **Iconography:** Google `Material Symbols Outlined` (`font-variation-settings: 'FILL' 1` on active nav & verification icons)

### Google Fonts Import
```css
@import url('https://fonts.googleapis.com/css2?family=Lato:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Source+Code+Pro:wght@500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block');
```

### Type Scale
| Token | Size | Line Height | Letter Spacing | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-md` | `36px` | `44px` | `-0.5px` | `700` | Primary KPI figures |
| `display-md-mobile` | `28px` | `34px` | `-0.25px` | `700` | Mobile hero KPIs |
| `headline-lg` | `24px` | `32px` | `-0.25px` | `700` | Page `h1` titles |
| `headline-md` | `20px` | `28px` | `0px` | `700` | Major section headers |
| `title-md` | `16px` | `24px` | `0px` | `600` | Card & modal headers |
| `title-sm` | `14px` | `20px` | `0px` | `600` | Card item titles, staff name |
| `body-md` | `14px` | `20px` | `0px` | `400` | Standard body & table cells |
| `body-sm` | `12px` | `16px` | `0px` | `400` | Subtitles, helper copy |
| `label-lg` | `14px` | `20px` | `0px` | `600` | Primary & secondary buttons |
| `label-md` | `12px` | `16px` | `0.25px` | `600` | Nav items, table headers, KPI labels |
| `label-sm` | `11px` | `16px` | `0.25px` | `600` | Status pills, small badges |
| `mono-sm` | `12px` | `16px` | `0px` | `500` | IDs, batch numbers, timestamps |

> Always apply `tabular-nums` to numeric counts, PHP currency (`₱`), timestamps, and table columns.

---

## 3. Layout, Spacing, Radii & Motion

### Spacing Scale
| Token | Value | Usage |
| :--- | :--- | :--- |
| `gutter-xs` | `4px` | Tight label/subtitle gaps, nav list spacing |
| `gutter-sm` | `8px` | Button icon gaps, inline badge clusters |
| `gutter-md` | `16px` | KPI grid gaps, form grids, claim card stacks |
| `gutter-lg` | `24px` | Sidebar gaps, split-column gaps |
| `gutter-xl` | `32px` | Major layout margins |
| `section` | `24px` | Vertical gap between main page sections |
| `page-margin` | `24px` | Standard page gutter |

### Border Radius
| Token | Value | Usage |
| :--- | :--- | :--- |
| `sm` | `4px` | Segmented tab pills, chart bars |
| `DEFAULT` | `8px` | Buttons, inputs, nav items, alert pills |
| `md` | `12px` | Cards, tables, banners, drawers, brand badge |
| `lg` | `16px` | Large containers |
| `full` | `9999px` | Status badges, progress bars, avatars |

### Transitions
- `state-change`: `120ms ease-out` (button hovers, nav active state, table row hover)
- `surface-enter`: `200ms cubic-bezier(0.2, 0, 0, 1)` (modals, drawers, toasts)

---

## 4. Component Patterns

### Application Shell & Sidebar
- Desktop layout: `min-h-screen flex flex-col lg:flex-row bg-surface`
- Sidebar: `w-full lg:w-60 shrink-0 bg-surface-container-lowest border-b lg:border-b-0 lg:border-r border-outline-variant flex flex-col justify-between p-4 gap-gutter-lg`
- Brand Header: `40×40px` `rounded-md bg-primary` Barangay Barretto coastal shield SVG icon + `Brgy. Barretto ReliefOps` / `Olongapo City, Zambales`
- Live Sync Status Pill: `bg-success-container border border-outline-variant rounded px-3 py-2` with `w-2.5 h-2.5 rounded-full bg-emerald-verified animate-pulse`
- Active Nav Item: `bg-primary-container text-primary font-body text-label-md rounded` (filled Material Symbol)
- Inactive Nav Item: `text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface`
- Footer Officer Profile: Initials circle (`bg-primary-container text-primary rounded-full`) + officer name & role + Sign Out button

### Primary & Secondary Buttons
- **Primary (`button-primary`):** `inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-primary text-on-primary font-body text-label-lg hover:opacity-95 transition-colors duration-state-change`
- **Secondary (`button-secondary`):** `inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-surface-container-lowest border border-outline-variant text-primary font-body text-label-lg hover:bg-primary-container transition-colors duration-state-change`
- **Destructive / Deny:** `bg-error text-on-error` or `border border-outline-variant bg-error-container text-on-error-container`

### Cards
- **Elevated KPI / Section Card (`card-elevated`):** `bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm` (or `p-5`)
- **Action / Queue Card (`card-action`):** `bg-surface border border-outline-variant rounded-md p-4 flex flex-col gap-gutter-sm`

### Standard Data Tables (`table-standard`)
- Container: `bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm overflow-hidden` + `w-full overflow-x-auto`
- Header row: `bg-surface-container-low border-b border-outline-variant`, `th` uses `font-body text-label-md text-on-surface-variant px-4 py-3`
- Body rows: `divide-y divide-outline-variant`, `hover:bg-surface-container-low transition-colors duration-state-change`

### Status Badges & Stock Progress Bars
- Pill base: `inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm whitespace-nowrap`
  - Success/Eligible/Committed/Healthy: `bg-success-container text-on-success-container`
  - Warning/Priority/Expiring ≤30d/Rolled Back: `bg-warning-container text-on-warning-container`
  - Error/Critical Low/Cooldown/Expiring ≤7d/Denied: `bg-error-container text-on-error-container`
  - Primary/Next Out/Cash: `bg-primary-container text-on-primary-container`
  - Neutral/Standard/Released: `bg-surface-container-low text-on-surface-variant`
- Stock bar: `w-full h-1.5 rounded-full bg-surface-container overflow-hidden` with colored inner bar (`bg-crimson-alert`, `bg-amber-fifo`, or `bg-emerald-verified`)

### Top Dismissible Low-Stock Alert Banner
- `w-full flex items-center justify-between gap-gutter-md px-4 py-3 bg-error text-on-error rounded-md shadow-sm`

---

## 5. Navigation Structure & Screen Inventory (8 Screens)

### Staff Navigation Order
| Route | Label | Material Icon | Extra |
| :--- | :--- | :--- | :--- |
| `/` | Dashboard Overview | `dashboard` | — |
| `/donations` | Incoming Donations | `volunteer_activism` | — |
| `/claims` | Claim Approvals | `fact_check` | Numeric `badge-numeric` (`bg-primary text-on-primary`) for pending count |
| `/inventory` | Batch Inventory & Expiry | `inventory_2` | — |
| `/reports` | Distribution Reports | `bar_chart` | — |
| `/audit` | Audit Logs | `receipt_long` | — |

### All 8 Stitch Screens
1. **Dashboard Overview (`/` — 1280×1450):** Dismissible low-stock banner, header with `+ Log Donation` / `+ Process Claim` actions, 4 KPI cards, 65/35 split (FIFO Inventory table + Incoming Claim Verification Queue cards), 50/50 bottom row (Purok grouped bar chart + Immutable Audit & Transaction Log feed).
2. **Incoming Donations & Fund-Flow Reports (`/donations` — 1280×1370):** Filter bar & Export button, 3 reconciliation KPI cards (Received, Released, Net Balance), 50/50 middle (Donor Contribution Summary table + Quick Log Incoming Donation form with In-Kind/Cash toggle), bottom full-width Fund-Flow & Purok Distribution Breakdown table.
3. **Claim Approval Queue (`/claims` — 1280×1024):** Status filter tabs (`Pending`, `Approved`, `Released`, `Denied`), split view with Claims table + right-hand 360px Claim Detail Drawer showing cooldown warnings, past household claim history, and approve/release/deny actions.
4. **Batch Inventory & FEFO Expiry (`/inventory` — 1280×1024):** `+ Register New Batch` CTA, 3 summary cards (Total SKUs, Expiring Within 7 Days, Low-Stock Alerts), batch-level FEFO table sorted earliest expiry first with inline Minimum Threshold input + `Save Alert Rule` action.
5. **Distribution Reports (`/reports` — 1280×1024):** `Generate DSWD Report` CTA, 3 coverage KPIs (Household Coverage Rate, Goods Utilization, Cash Fund Disbursed), 2-column Purok-Level Distribution & Saturation Report cards with progress bars.
6. **Audit Log & Transaction History (`/audit` — 1280×1024):** Tamper-evident COA/DSWD badge, 4-column search & filter card, full audit ledger table with monospace timestamps, TX IDs, stock delta coloring, and Committed/Rolled Back badges.
7. **Resident Aid Portal (`/portal` — 390×1606 mobile-first):** Navy header with Live badge & verified Resident Profile pill, Active Claim Pass hero card with 3-step horizontal progress tracker (`Submitted` → `Verified & Approved` → `Ready for Release`) and crisp SVG QR Claim Pass, Aid Eligibility & Cooldown Rules card, Request Assistance 2×2 tap-card grid, and Recent Household Claims list.
8. **Login & Role Portal (`/login` — 1280×1024):** Official navy header with `System Operational` badge, centered `max-w-md` card with `Barangay Staff / Admin` vs `Resident Portal` role switcher tabs, form inputs, and Barangay Barretto BDRRMC hotline footer.

---

## 6. Tailwind Configuration (`tailwind.config.js`)

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'maritime-navy': '#1E3A8A',
        'cool-canvas': '#F8FAFC',
        'emerald-verified': '#059669',
        'amber-fifo': '#D97706',
        'crimson-alert': '#DC2626',
        'primary': '#1E3A8A',
        'on-primary': '#FFFFFF',
        'primary-container': '#EFF0FF',
        'on-primary-container': '#00164E',
        'secondary': '#475569',
        'on-secondary': '#FFFFFF',
        'secondary-container': '#E2E8F0',
        'on-secondary-container': '#1E293B',
        'success': '#006C4A',
        'on-success': '#FFFFFF',
        'success-container': '#ECFDF5',
        'on-success-container': '#002114',
        'warning': '#904D00',
        'on-warning': '#FFFFFF',
        'warning-container': '#FEF3C7',
        'on-warning-container': '#2F1500',
        'error': '#DC2626',
        'on-error': '#FFFFFF',
        'error-container': '#FEF2F2',
        'on-error-container': '#7F1D1D',
        'surface': '#F8FAFC',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#F1F5F9',
        'surface-container': '#E2E8F0',
        'surface-container-high': '#CBD5E1',
        'on-surface': '#0F172A',
        'on-surface-variant': '#475569',
        'outline': '#64748B',
        'outline-variant': '#E2E8F0',
        'inverse-surface': '#0F172A',
        'inverse-on-surface': '#F8FAFC',
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '8px',
        'md': '12px',
        'lg': '16px',
        'full': '9999px',
      },
      spacing: {
        'gutter-xs': '4px',
        'gutter-sm': '8px',
        'gutter-md': '16px',
        'gutter-lg': '24px',
        'gutter-xl': '32px',
        'section': '24px',
        'page-margin': '24px',
      },
      fontFamily: {
        'display': ['"Lato"', 'sans-serif'],
        'headline': ['"Lato"', 'sans-serif'],
        'title': ['"Plus Jakarta Sans"', 'sans-serif'],
        'body': ['"Plus Jakarta Sans"', 'sans-serif'],
        'label': ['"Plus Jakarta Sans"', 'sans-serif'],
        'mono': ['"Source Code Pro"', 'monospace'],
      },
      fontSize: {
        'display-md': ['36px', { lineHeight: '44px', letterSpacing: '-0.5px', fontWeight: '700' }],
        'display-md-mobile': ['28px', { lineHeight: '34px', letterSpacing: '-0.25px', fontWeight: '700' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.25px', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '0px', fontWeight: '700' }],
        'title-md': ['16px', { lineHeight: '24px', letterSpacing: '0px', fontWeight: '600' }],
        'title-sm': ['14px', { lineHeight: '20px', letterSpacing: '0px', fontWeight: '600' }],
        'body-md': ['14px', { lineHeight: '20px', letterSpacing: '0px', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '16px', letterSpacing: '0px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0px', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.25px', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '16px', letterSpacing: '0.25px', fontWeight: '600' }],
        'mono-sm': ['12px', { lineHeight: '16px', letterSpacing: '0px', fontWeight: '500' }],
      },
      transitionDuration: {
        'state-change': '120ms',
        'surface-enter': '200ms',
      },
      transitionTimingFunction: {
        'state-change': 'ease-out',
        'surface-enter': 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
};
```
