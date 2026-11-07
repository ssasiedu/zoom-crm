# Supervisor guide

Supervisors see every ticket, balance workloads, review resolutions and track performance.

## Dashboard
The dashboard opens on **This month**. Use the filter bar to change the date range or narrow by region, officer, issue type or type of contact — every chart and figure follows.

- **KPI cards** — click any card (Open, Overdue, Unassigned…) to open the matching tickets.
- **Tickets over time** — opened vs resolved per day, week or month depending on the range.
- **Tickets by region** — click a region tile to filter the whole dashboard; click again to clear.
- **Charts** — click a bar or slice to drill down to those tickets.
- **Officer workload** — active and overdue tickets per officer; click the amber part of a bar to see that officer's active tickets.

## Assigning work
- **Unassigned** KPI → select tickets with the checkboxes → **Assign**.
- The picker shows each officer's open, in-progress and overdue counts with a load bar, and suggests the least busy officer in the ticket's region.
- Add an **assignment note** if the officer needs context. The officer is notified immediately.
- To reassign one ticket, open it and click **Reassign**.

## Reviewing and closing
1. Filter **All Tickets** by status **Resolved**.
2. Open each ticket, check REMARKS, COMPLETION DATE and payment details.
3. **Close ticket** when satisfied. To send it back, click **Reopen** and give a reason — the officer is notified and the completion date is cleared.

Bulk: select tickets → **Change status**. Tickets only move one step (Open → In-Progress → Resolved → Closed, or reopen). Tickets not in the right starting status are skipped, and resolving in bulk requires a shared REMARKS text.

## Editing tickets
You can edit all client and issue details and **override the DUE DATE** (for example when a client asks for a later callback). Changing the issue type recalculates the due date from the new SLA unless you set one yourself. DATE OPENED can only be changed by an admin.

## Monitoring SLAs
- **Overdue** chip on All Tickets, or the Overdue KPI.
- **Reports → SLA & overdue ageing** buckets overdue tickets by how late they are (0–2, 3–7, 8–14, 15+ days) per region and per officer. Click a region row to open those tickets.
- Overdue tickets require a REASON FOR OPEN STATUS from the officer — use it in follow-ups.

## Debt recovery

**Debtor Lists** holds the monthly list of customers who owe money: upload it, assign accounts to officers, and watch collections come in. See the [debt recovery guide](debt-recovery-guide.md) for the full cycle.

## Turnaround time

Every ticket now records two timings: **waiting time** (raised → first worked on) and **turnaround time** (raised → completed). The dashboard shows the averages, and **Reports → Turnaround time** breaks them down by officer, issue type, region and month, with a distribution showing how many tickets are resolved within an hour, within a day, and so on. Use the median rather than the average when a handful of very old tickets distort the picture.

## Reports
**Reports** has seven views: status per region, issue type per region, payments per region, officer performance per type of contact, turnaround time, SLA ageing and the monthly report. All share the filter bar. **Export** gives Excel (one sheet per table) or a branded PDF.

The **Monthly report** tab summarises a whole month (KPIs, channels, issue types, regions, officers, payments, ageing). Pick the month and click **Download PDF** — ideal for management meetings.

## Saved views
On All Tickets, set up filters (e.g. *Ashanti · PAYMENT ISSUE · Overdue*) and choose **Views → Save current filters**. Views are personal. The page URL also contains the filters, so you can bookmark or share it with colleagues who have access.

## Exports and imports
Export respects the current filters or your selection. Imports create **Open** tickets; you can include an OFFICER column to assign them at once.
