"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import clsx from "clsx";

export function Navbar({ role }: { role: "admin" | "crew" }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/calendar", label: "Calendar" },
    ...(role === "admin"
      ? [
          { href: "/admin/schedule", label: "Dispatch" },
          { href: "/admin/import", label: "New Job" },
          { href: "/admin/bulk-import", label: "Bulk Import" },
          { href: "/admin/customers", label: "Customers" },
          { href: "/admin/crew", label: "Crew" },
        ]
      : []),
  ];

  return (
    <header className="bg-ink text-paper sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <span className="font-display font-bold tracking-tight text-lg">FLEET OPS</span>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "px-3 py-2 text-sm rounded transition",
                pathname.startsWith(link.href) ? "bg-safety text-white" : "text-paper/70 hover:text-paper"
              )}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleSignOut}
            className="px-3 py-2 text-sm rounded text-paper/70 hover:text-paper transition"
          >
            Sign Out
          </button>
        </nav>
      </div>
    </header>
  );
}
