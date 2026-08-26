"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InstallAppButton } from "./InstallAppButton";
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
          { href: "/admin/billing", label: "Billing" },
          { href: "/admin/crew", label: "Crew" },
        ]
      : []),
  ];
  return (
    <header className="bg-white text-ink sticky top-0 z-10 border-b border-line">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <Image src="/logo.png" alt="Superior Wash" width={200} height={60} className="h-9 w-auto" priority />
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "px-3 py-2 text-sm rounded transition font-medium",
                pathname.startsWith(link.href) ? "bg-brand text-white" : "text-steel hover:text-ink"
              )}
            >
              {link.label}
            </Link>
          ))}
          <InstallAppButton />
          <button
            onClick={handleSignOut}
            className="px-3 py-2 text-sm rounded text-steel hover:text-ink transition font-medium"
          >
            Sign Out
          </button>
        </nav>
      </div>
    </header>
  );
}
