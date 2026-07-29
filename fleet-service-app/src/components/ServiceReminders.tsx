import Link from "next/link";
import clsx from "clsx";
import type { CustomerWithStatus } from "@/lib/types";

export function ServiceReminders({ customers }: { customers: CustomerWithStatus[] }) {
  const overdue = customers.filter((c) => c.status === "overdue").sort((a, b) => b.days_overdue - a.days_overdue);
  const dueSoon = customers.filter((c) => c.status === "due_soon");

  if (overdue.length === 0 && dueSoon.length === 0) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <div className="border border-alert/30 bg-alert/5 rounded-lg p-4">
        <p className="font-semibold text-sm mb-2">
          {overdue.length > 0
            ? `${overdue.length} account${overdue.length === 1 ? "" : "s"} overdue for service`
            : `${dueSoon.length} account${dueSoon.length === 1 ? "" : "s"} due soon`}
        </p>
        <div className="flex flex-col gap-1.5">
          {[...overdue, ...dueSoon].slice(0, 6).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                <span className="font-medium">{c.name}</span>{" "}
                <span
                  className={clsx(
                    "text-xs",
                    c.status === "overdue" ? "text-alert" : "text-safety"
                  )}
                >
                  {c.status === "overdue"
                    ? `— ${c.days_overdue} day${c.days_overdue === 1 ? "" : "s"} overdue`
                    : `— due ${c.next_due_date}`}
                </span>
              </span>
              <Link
                href={`/admin/import?customer_id=${c.id}&client_name=${encodeURIComponent(c.name)}`}
                className="shrink-0 text-xs font-semibold bg-ink text-white px-2.5 py-1.5 rounded hover:opacity-90 transition"
              >
                Schedule Now
              </Link>
            </div>
          ))}
        </div>
        {customers.filter((c) => c.status === "overdue" || c.status === "due_soon").length > 6 && (
          <Link href="/admin/customers" className="block mt-2 text-xs font-semibold text-safety hover:underline">
            View all in Customers →
          </Link>
        )}
      </div>
    </div>
  );
}
