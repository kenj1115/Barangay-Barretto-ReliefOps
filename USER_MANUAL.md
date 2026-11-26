# Barangay Barretto ReliefOps User Manual

This manual explains the day-to-day use of the Barangay Donation & Relief Inventory Management System. Menu options depend on the account role: barangay staff and administrators manage operations, while residents can view aid information and submit household claims.

## 1. Sign in and navigate

1. Open the ReliefOps web address supplied by your administrator.
2. Select the appropriate sign-in tab: **Barangay Staff / Admin** or **Resident Portal**.
3. Enter the username or account ID and password issued to you, then select **Sign In**.
4. To leave the system, select the sign-out icon in the navigation panel.

The selected tab changes the form labels; access is determined by the role assigned to your account. Do not share your password or leave a signed-in terminal unattended.

Staff and administrators can access:

- **Dashboard Overview** — current operational summary and shortcuts.
- **Incoming Donations** — records cash or in-kind contributions.
- **Cash Assistance** — records household cash payments.
- **Claim Approvals** — reviews resident requests and records handover.
- **Batch Inventory & Expiry** — monitors stock, expiry, and low-stock rules.
- **Distribution Reports** — summarizes released aid and fund flow.
- **Audit Logs** — searches the transaction history.

Residents are directed to the **Resident Portal**.

## 2. Staff and administrator workflows

### 2.1 Review the dashboard

Use the dashboard for a high-level view of donations, inventory, pending claims, and distribution activity. Select a shortcut or navigation item to open the corresponding operational page.

The navigation panel shows **Live Sync Connected** when real-time updates are connected. If it shows a reconnecting status, check your connection and refresh the page if updates do not resume.

### 2.2 Record an incoming donation

1. Open **Incoming Donations**.
2. Choose **In-Kind Goods** or **Cash Donation**.
3. Enter the donor name and select the donor/organization type.
4. For an in-kind donation, select the inventory item and enter the quantity. Add a batch number and expiry date when available.
5. For a cash donation, enter the amount in PHP.
6. Select **Record & Broadcast Stock Update**.

An in-kind donation creates an inventory batch and updates usable stock. A cash donation increases the recorded cash fund. The transaction is audited, and connected staff screens refresh automatically.

Enter goods through this donation form when they are associated with a donor. Use **Register New Batch** in Inventory for stock that needs an inventory batch record but is not being recorded as a new donation. Do not enter the same goods through both workflows.

### 2.3 Manage inventory and expiry

The inventory page displays stock by batch, sorted by expiry priority (FEFO: First-Expired, First-Out). Batches expiring soon are highlighted. Expired batches are quarantined and excluded from available stock and claim approvals.

To register stock:

1. Select **+ Register New Batch**.
2. Choose **Existing Item SKU** or **Create New SKU**.
3. Select or enter the item, then provide the batch number and quantity.
4. Enter an expiry date if the goods expire; leave it blank for non-expiring stock.
5. Select **Register Batch**.

To change an item's low-stock alert level, edit its **Minimum Threshold** in the batch table and select **Save Alert Rule**. Low-stock events appear as live alerts for staff.

Expired stock is blocked from release but is not automatically written off. Follow barangay procedures and obtain the appropriate authorization before taking any separate disposal or write-off action.

### 2.4 Review, approve, deny, and release claims

1. Open **Claim Approvals** and choose a status tab such as **Pending**.
2. Select a claim to inspect the household, requested item and quantity, reason, and submission date.
3. For an eligible claim, set the approved quantity if needed, add officer notes, and select **Approve & FEFO Deduct**.
4. For an ineligible claim, enter a clear reason in the notes and select **Deny**.
5. After approved goods have actually been handed to the household, select **Mark Released** or **Confirm Physical Release**.

Claim statuses mean:

- **Pending** — awaiting staff review.
- **Approved** — approved and the required stock has been deducted; ready for pickup.
- **Released** — the physical handover has been recorded.
- **Denied** — the request was declined.

Approval and release are separate steps. Approving a claim deducts stock; confirm release only after the goods have been handed over. Approval, denial, release, and related stock changes are recorded for audit. The system prevents a household from submitting the same aid-item claim again during the configured cooldown period.

### 2.5 Record a cash assistance payment

1. Open **Cash Assistance**.
2. Choose the household, enter the amount in PHP, and provide the assistance purpose.
3. Add a payment reference if available.
4. Verify the details and select **Record & Audit Payment**.

The page shows cash received, cash disbursed, and the available balance, as well as recent payments. Payments are checked against the available fund and recorded with the household, purpose, officer, and time. Check the household and amount carefully before submitting; contact an administrator if a recorded payment needs correction.

### 2.6 View and export reports

Open **Distribution Reports** to view household coverage, goods utilization, cash balance, per-purok breakdowns, and physical release records. Approved-but-not-yet-released goods are shown separately from completed releases. Select **Generate DSWD Report** to download the report.

The **Incoming Donations** page also provides donor summaries, fund-flow figures, filters, and **Export CSV Report**. Use the filters to narrow the displayed records before exporting.

### 2.7 Search audit history

Open **Audit Logs** to review recorded actions. Search by transaction, ID, action, or staff member; optionally select an entity or action filter. Use **Previous** and **Next** to move through result pages and **Reset Filters** to clear the search.

## 3. Resident Portal

### 3.1 Check available aid and eligibility

The portal displays available relief items, household claim activity, and notifications. Items marked **Out of Stock** or **Cooldown Active** cannot be selected. The portal displays the current cooldown rule; the same household cannot request the same type of aid again while that rule is active.

### 3.2 Submit a household claim

1. In **Request Assistance**, select an available item.
2. Enter the requested quantity and, if useful, a reason or household note.
3. Select **Submit Claim Request** once.
4. Check **Recent Household Claims** and **Notifications** for status updates.

A submitted request is not yet approved. Staff review eligibility and stock. If approved, follow the pickup instructions shown in the portal and present the claim reference at Barangay Barretto Hall. The portal updates the request when it is approved, denied, or released.

## 4. Important operating guidance

- Confirm donor, household, quantity, amount, and purpose details before submitting; submissions create audit records.
- Never approve more goods than the household is eligible for or the system can supply.
- Do not mark a claim released before the physical handover.
- Do not distribute expired or quarantined stock.
- A recorded action has no user-facing edit or delete option. If a record is wrong, notify an administrator and follow the barangay correction procedure rather than creating a duplicate transaction.
- Keep account credentials private and sign out on shared devices.

## 5. Troubleshooting

- **Unable to sign in:** Check the username and password, confirm the correct account was issued, and contact an administrator if access remains blocked.
- **A page shows an error or does not load records:** Refresh once and confirm the system is reachable. If the problem persists, report the page, approximate time, and action being performed to the administrator.
- **Live updates are not appearing:** Check the **Live Sync** indicator and your network connection, then refresh. If other users see updates but you do not, contact the administrator.
- **An item cannot be requested or approved:** Check its available quantity, expiry status, and household cooldown. Ask staff to review eligibility or stock if the displayed information seems incorrect.
- **A donation or payment was entered incorrectly:** Contact an administrator promptly with the transaction reference. Do not submit a second transaction as a correction.
