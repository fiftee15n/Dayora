import { EncodingType, StorageAccessFramework, writeAsStringAsync } from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as SecureStore from "expo-secure-store";
import { format } from "date-fns/format";

import type { MonthlyReport } from "./screens/MonthlyReportScreen";
import { formatMoney, monthLabel, parseDateOnly } from "./utils";

/* Monthly report as a PDF, saved to a folder the user picks (Downloads by default).
   Android asks for the folder once; after that the app remembers it. */

const FOLDER_KEY = "dayora_download_folder";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function reportHtml(r: MonthlyReport, currency: string, userName?: string): string {
  const m = (v: number) => esc(formatMoney(v, currency));
  const [y, mo] = r.month.split("-").map(Number);
  const title = format(new Date(y, mo - 1, 1), "MMMM yyyy");
  const prev = monthLabel(r.previous.month);
  const change = (v: number | null, goodUp: boolean) => {
    if (v === null) return `<span class="muted">no data for ${esc(prev)}</span>`;
    const better = goodUp ? v > 0 : v < 0;
    const cls = v === 0 ? "muted" : better ? "good" : "bad";
    return `<span class="${cls}">${v > 0 ? "▲" : v < 0 ? "▼" : ""} ${Math.abs(Math.round(v))}% vs ${esc(prev)}</span>`;
  };
  const people = (rows: { person: string; amount: number }[]) =>
    rows.map((p) => `<tr><td>${esc(p.person)}</td><td class="num">${m(p.amount)}</td></tr>`).join("");

  const cats = r.top_categories.length
    ? r.top_categories
        .map(
          (c) => `<tr><td><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</td>
            <td class="bar"><div style="width:${Math.max(2, c.percent)}%;background:${esc(c.color)}"></div></td>
            <td class="num">${m(c.total)}</td><td class="num muted">${Math.round(c.percent)}%</td></tr>`,
        )
        .join("")
    : `<tr><td class="muted">No expenses this month.</td></tr>`;

  const completed = r.savings.completed
    .map(
      (g) => `<tr><td>✓ ${esc(g.name)}</td><td class="num">spent ${m(g.spent)}</td>
        <td class="num muted">${g.leftover > 0 ? `${m(g.leftover)} back` : g.leftover < 0 ? `${m(-g.leftover)} over` : "exact"}</td></tr>`,
    )
    .join("");
  const running = r.savings.in_progress
    .map(
      (g) => `<tr><td>${esc(g.name)}</td><td class="num">${m(g.saved)}${g.target ? ` of ${m(g.target)}` : ""}</td>
        <td class="num muted">${g.progress !== null ? `${Math.round(g.progress)}%` : ""}</td></tr>`,
    )
    .join("");

  const notes: string[] = [];
  if (r.income_for_other_months > 0) notes.push(`Income includes ${m(r.income_for_other_months)} that was for another month.`);
  if (r.received_later > 0) notes.push(`${m(r.received_later)} for ${esc(monthLabel(r.month))} was received in another month (not counted here).`);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif; color: #0A0A0A; font-size: 11.5px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0A0A0A; padding-bottom: 10px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
  h1 { font-size: 26px; margin: 4px 0 0; letter-spacing: -0.5px; }
  .sub { color: #737373; font-size: 11px; text-align: right; }
  .hero { background: #0A0A0A; color: #fff; border-radius: 14px; padding: 16px 18px; margin: 16px 0 12px; display: flex; justify-content: space-between; align-items: center; }
  .hero .label { font-size: 10px; letter-spacing: 1.5px; opacity: .65; font-weight: 700; }
  .hero .big { font-size: 30px; font-weight: 800; margin-top: 4px; }
  .hero .side { text-align: right; opacity: .8; font-size: 11px; line-height: 1.6; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .stat { border: 1px solid #E5E5E5; border-radius: 12px; padding: 10px 12px; }
  .stat .k { color: #737373; font-size: 10px; font-weight: 700; }
  .stat .v { font-size: 16px; font-weight: 800; margin: 4px 0 2px; }
  .stat .n { font-size: 9.5px; }
  h2 { font-size: 13px; margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #E5E5E5; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; vertical-align: middle; }
  td.num { text-align: right; white-space: nowrap; padding-left: 10px; font-variant-numeric: tabular-nums; }
  td.bar { width: 38%; padding: 0 6px 0 12px; }
  td.bar div { height: 6px; border-radius: 3px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 7px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .pills { display: flex; gap: 8px; margin-bottom: 6px; }
  .pill { flex: 1; background: #F5F5F5; border-radius: 10px; padding: 8px 10px; }
  .pill .k { color: #737373; font-size: 10px; font-weight: 700; } .pill .v { font-size: 15px; font-weight: 800; margin-top: 2px; }
  .cap { color: #737373; font-size: 9.5px; font-weight: 700; letter-spacing: 1px; margin: 8px 0 2px; }
  .muted { color: #737373; } .good { color: #15803D; font-weight: 700; } .bad { color: #D92D20; font-weight: 700; }
  .note { color: #737373; font-size: 10.5px; margin-top: 8px; }
  .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #E5E5E5; color: #A3A3A3; font-size: 9.5px; display: flex; justify-content: space-between; }
  </style></head><body>
  <div class="head">
    <div><div class="brand">dayora.</div><h1>${esc(title)}</h1></div>
    <div class="sub">Monthly report${r.partial ? ` · so far (${r.days} days)` : ""}${userName ? `<br>${esc(userName)}` : ""}</div>
  </div>

  <div class="hero">
    <div><div class="label">${r.partial ? "BALANCE SO FAR" : "BALANCE FOR THE MONTH"}</div>
      <div class="big">${r.balance < 0 ? "−" : ""}${m(Math.abs(r.balance))}</div></div>
    <div class="side">Income ${m(r.income)}<br>Expenses ${m(r.expense)}<br>${r.transactions} transactions</div>
  </div>

  <div class="grid">
    <div class="stat"><div class="k">Total income</div><div class="v">${m(r.income)}</div><div class="n">${change(r.previous.income_change, true)}</div></div>
    <div class="stat"><div class="k">Total expense</div><div class="v">${m(r.expense)}</div><div class="n">${change(r.previous.expense_change, false)}</div></div>
    <div class="stat"><div class="k">Avg daily expense</div><div class="v">${m(r.avg_daily_expense)}</div><div class="n muted">over ${r.days} days</div></div>
    <div class="stat"><div class="k">Most spent in a day</div><div class="v">${r.top_spending_day ? m(r.top_spending_day.amount) : "—"}</div>
      <div class="n muted">${r.top_spending_day ? esc(format(parseDateOnly(r.top_spending_day.date), "EEE d MMM")) : "no expenses"}</div></div>
  </div>
  ${notes.length ? `<div class="note">${notes.join(" ")}</div>` : ""}

  <h2>Where the money went</h2>
  <table>${cats}</table>
  ${r.biggest_expense ? `<div class="note">Biggest expense: ${esc(r.biggest_expense.description)}, ${m(r.biggest_expense.amount)} on ${esc(format(parseDateOnly(r.biggest_expense.date), "d MMM"))}</div>` : ""}

  <div class="two">
    <div>
      <h2>${r.partial ? "Loans today" : "Loans at month end"}</h2>
      <div class="pills"><div class="pill"><div class="k">Owed to me</div><div class="v">${m(r.loans.owed_to_me)}</div></div>
        <div class="pill"><div class="k">I owe</div><div class="v">${m(r.loans.i_owe)}</div></div></div>
      ${r.loans.owed_to_me_people.length ? `<div class="cap">OWED TO ME</div><table>${people(r.loans.owed_to_me_people)}</table>` : ""}
      ${r.loans.i_owe_people.length ? `<div class="cap">I OWE</div><table>${people(r.loans.i_owe_people)}</table>` : ""}
      ${!r.loans.owed_to_me && !r.loans.i_owe ? `<div class="note">No open loans.</div>` : ""}
    </div>
    <div>
      <h2>Savings</h2>
      <div class="pills"><div class="pill"><div class="k">Put aside</div><div class="v">${m(r.savings.put_aside)}</div></div>
        <div class="pill"><div class="k">Taken out</div><div class="v">${m(r.savings.taken_out)}</div></div></div>
      ${completed ? `<div class="cap">COMPLETED THIS MONTH</div><table>${completed}</table>` : ""}
      ${running ? `<div class="cap">IN PROGRESS</div><table>${running}</table>` : ""}
      ${!completed && !running && !r.savings.put_aside ? `<div class="note">No savings goals this month.</div>` : ""}
    </div>
  </div>

  <div class="foot"><span>Dayora · ${esc(title)} report</span><span>Created ${esc(format(new Date(), "d MMM yyyy, h:mm a"))}</span></div>
  </body></html>`;
}

/** Make the PDF and save it. Returns the saved file's name, or null if the user cancelled. */
export async function downloadReportPdf(r: MonthlyReport, currency: string, userName?: string): Promise<string | null> {
  const { base64 } = await Print.printToFileAsync({ html: reportHtml(r, currency, userName), base64: true });
  if (!base64) throw new Error("Couldn't create the PDF");
  const name = `Dayora report ${r.month}${r.partial ? " (so far)" : ""}`;

  // Use the remembered folder; if it's gone (or never chosen), ask, starting at Downloads.
  let folder = await SecureStore.getItemAsync(FOLDER_KEY).catch(() => null);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!folder) {
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync(
        StorageAccessFramework.getUriForDirectoryInRoot("Download"),
      );
      if (!perm.granted) return null;
      folder = perm.directoryUri;
      await SecureStore.setItemAsync(FOLDER_KEY, folder).catch(() => {});
    }
    try {
      const uri = await StorageAccessFramework.createFileAsync(folder, name, "application/pdf");
      await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
      return `${name}.pdf`;
    } catch (e) {
      // Folder permission lost (e.g. folder deleted): forget it and ask once more.
      folder = null;
      await SecureStore.deleteItemAsync(FOLDER_KEY).catch(() => {});
      if (attempt === 1) throw e;
    }
  }
  return null;
}
