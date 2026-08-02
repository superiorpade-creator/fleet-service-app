export type UserRole = "admin" | "crew";
export type JobStatus = "scheduled" | "in_progress" | "completed";
export type CustomerFrequency = "weekly" | "biweekly" | "monthly";
export type ServiceStatus = "on_track" | "due_soon" | "overdue" | "no_history";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  frequency: CustomerFrequency;
  notes: string | null;
  created_at: string;
}

// A customer plus its computed service-reminder state — never stored,
// always derived at request time from that customer's job history.
export interface CustomerWithStatus extends Customer {
  last_service_date: string | null;
  next_due_date: string | null;
  status: ServiceStatus;
  days_overdue: number; // 0 unless status === "overdue"
}

export interface Unit {
  id: string;
  job_id: string;
  unit_number: string;
  location: string | null;
  unit_type: string | null;
  serviced: boolean;
  not_on_site: boolean; // crew marks this instead of serviced when a truck isn't there that day
  notes: string | null;
  photo_url: string | null;
  serviced_at: string | null;
  serviced_by: string | null;
  sort_order: number;
}

export interface Job {
  id: string;
  job_number: number | null; // auto-assigned by the DB once scheduled_date is set; null until then
  customer_id: string | null; // optional link to a Customers record
  client_name: string;
  scheduled_date: string | null; // ISO date e.g. 2026-08-04, or null until placed on the dispatch board
  status: JobStatus;
  notes: string | null;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Convenience shape used once a job's related rows are joined/fetched together
export interface JobWithDetails extends Job {
  units: Unit[];
  crew: Profile[];
}

// Row shape parsed straight out of an uploaded Excel sheet, before it
// becomes `units` rows attached to a job.
export interface ImportedUnitRow {
  unit_number: string;
  location?: string;
  unit_type?: string;
}

// Row shape used by the admin Edit Job unit editor — same as
// ImportedUnitRow, plus an optional id (present for existing units, absent
// for ones the admin just added) and the current serviced state, so
// corrections don't wipe out crew's progress.
export interface EditableUnitRow extends ImportedUnitRow {
  id?: string;
  serviced?: boolean;
}

// Flattened shape used by the admin dispatch board: one job, its assigned
// technician ids, and a unit count (for the card subtitle).
export interface BoardJob {
  id: string;
  job_number: number | null;
  client_name: string;
  scheduled_date: string | null;
  status: JobStatus;
  crew_ids: string[];
  unit_count: number;
}
