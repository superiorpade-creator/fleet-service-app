import { Navbar } from "@/components/Navbar";
import { BulkImportForm } from "@/components/BulkImportForm";

export default function BulkImportPage() {
  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Bulk Import</h1>
        <p className="text-steel text-sm mb-6">
          Drop in every spreadsheet at once — one work order gets created per file, with the
          customer name guessed from the filename. Review and fix names before creating.
        </p>
        <BulkImportForm />
      </main>
    </>
  );
}
