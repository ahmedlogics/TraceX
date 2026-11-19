-- WearTrail | complete fresh-install schema | PostgreSQL 15+
-- Run ONCE as the database owner in Supabase SQL Editor.
-- Fresh installation only. Does not delete or reset any existing schema.
-- If the original SupplyEase schema exists, use WearTrail_Upgrade_Existing.sql instead.
-- Internal schema name supplyease is retained for compatibility with the original design.
-- No staff passwords, device credentials, real reader indices or sample business data are seeded.
BEGIN;
DO $$ BEGIN
  IF to_regnamespace('supplyease') IS NOT NULL THEN
    RAISE EXCEPTION 'supplyease already exists. Use the upgrade script; this fresh-install script does not overwrite it.';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS supplyease;
REVOKE ALL ON SCHEMA supplyease FROM PUBLIC;
SET LOCAL search_path = supplyease, pg_catalog;

CREATE TYPE staff_role AS ENUM (
  'admin', 'manager', 'materials', 'production', 'quality', 'logistics'
);
CREATE TYPE credential_purpose AS ENUM ('activate', 'reset');
CREATE TYPE quantity_unit AS ENUM ('m', 'kg', 'pcs');
CREATE TYPE order_status AS ENUM ('draft', 'approved', 'in_progress', 'completed', 'cancelled');
CREATE TYPE garment_stage AS ENUM (
  'cut', 'stitched', 'finished', 'packed', 'warehoused', 'dispatched', 'returned', 'scrapped'
);
CREATE TYPE quality_status AS ENUM ('awaiting_inspection', 'held', 'released', 'scrapped');
CREATE TYPE inspection_scope AS ENUM ('incoming', 'final', 'reinspection');
CREATE TYPE inspection_outcome AS ENUM ('pass', 'fail');
CREATE TYPE material_movement_kind AS ENUM (
  'accepted', 'issued', 'unused_return', 'adjustment_add', 'adjustment_remove'
);
CREATE TYPE hold_kind AS ENUM ('quality', 'operational', 'recall');
CREATE TYPE rework_status AS ENUM ('open', 'assigned', 'repair_recorded', 'closed', 'scrapped');
CREATE TYPE task_status AS ENUM (
  'queued', 'assigned', 'claimed', 'in_progress', 'completed', 'cancelled'
);
CREATE TYPE capture_status AS ENUM (
  'awaiting_ack', 'awaiting_clear', 'armed', 'completed', 'expired', 'cancelled'
);
CREATE TYPE sensor_edge AS ENUM ('OBJECT_DETECTED', 'OBJECT_CLEARED');
CREATE TYPE observation_resolution AS ENUM ('recorded', 'accepted', 'quarantined');
CREATE TYPE package_status AS ENUM ('open', 'sealed', 'warehoused', 'dispatched', 'void');
CREATE TYPE shipment_status AS ENUM ('draft', 'approved', 'dispatched', 'delivered', 'cancelled');
CREATE TYPE return_status AS ENUM ('received', 'under_inspection', 'released', 'scrapped', 'closed');
CREATE TYPE ledger_job_status AS ENUM ('pending', 'submitted', 'confirmed', 'failed');
CREATE TYPE ledger_tx_status AS ENUM ('submitted', 'confirmed', 'reverted', 'replaced', 'orphaned');

-- This project represents one factory. Department codes are stable API identifiers.
CREATE TABLE departments (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  suspended_at timestamptz,
  CHECK (activated_at IS NULL OR password_hash IS NOT NULL)
);

CREATE TABLE staff_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id),
  role staff_role NOT NULL,
  department_code text REFERENCES departments(code),
  granted_by uuid REFERENCES staff_users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES staff_users(id),
  CHECK ((role IN ('admin', 'manager')) = (department_code IS NULL)),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE UNIQUE INDEX staff_role_grants_active_uq
  ON staff_role_grants (staff_user_id, role, department_code) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;

CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id),
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX staff_sessions_active_idx ON staff_sessions (staff_user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE staff_credential_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id),
  purpose credential_purpose NOT NULL,
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  issued_by uuid REFERENCES staff_users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (consumed_at IS NULL OR (consumed_at >= issued_at AND consumed_at < expires_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
  CHECK (num_nonnulls(consumed_at, revoked_at) <= 1)
);
CREATE INDEX staff_credential_tokens_user_idx
  ON staff_credential_tokens (staff_user_id, purpose, expires_at);

CREATE TABLE checkpoints (
  code text PRIMARY KEY,
  name text NOT NULL,
  department_code text NOT NULL REFERENCES departments(code)
);

CREATE TABLE workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  approved_by uuid NOT NULL REFERENCES staff_users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_code, version)
);

CREATE TABLE workflow_steps (
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id),
  step_code text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  department_code text NOT NULL REFERENCES departments(code),
  checkpoint_code text REFERENCES checkpoints(code),
  PRIMARY KEY (workflow_version_id, step_code),
  UNIQUE (workflow_version_id, position)
);

CREATE TABLE product_spec_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  product_name text NOT NULL,
  specifications jsonb NOT NULL CHECK (jsonb_typeof(specifications) = 'object'),
  approved_by uuid NOT NULL REFERENCES staff_users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (style_code, version)
);

CREATE TABLE checklist_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  scope inspection_scope NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  approved_by uuid NOT NULL REFERENCES staff_users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_code, version),
  UNIQUE (id, scope)
);

-- Device secrets are held by the board and server-side secret storage.
-- The database stores only digests of high-entropy device credentials.
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  registered_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE device_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  credential_digest bytea NOT NULL UNIQUE CHECK (octet_length(credential_digest) = 32),
  issued_by uuid NOT NULL REFERENCES staff_users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX device_credentials_active_idx ON device_credentials (device_id)
  WHERE revoked_at IS NULL;

CREATE TABLE device_mapping_versions (
  device_id uuid NOT NULL REFERENCES devices(id),
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  bench_verified_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  PRIMARY KEY (device_id, version),
  CHECK (activated_at IS NULL OR
         (bench_verified_at IS NOT NULL AND activated_at >= bench_verified_at)),
  CHECK (retired_at IS NULL OR (activated_at IS NOT NULL AND retired_at >= activated_at))
);
CREATE UNIQUE INDEX device_mapping_active_uq ON device_mapping_versions (device_id)
  WHERE activated_at IS NOT NULL AND retired_at IS NULL;

CREATE TABLE device_sensor_mappings (
  device_id uuid NOT NULL,
  mapping_version integer NOT NULL,
  sensor_code text NOT NULL CHECK (btrim(sensor_code) <> ''),
  checkpoint_code text NOT NULL REFERENCES checkpoints(code),
  gpio smallint NOT NULL CHECK (gpio >= 0),
  active_low boolean NOT NULL,
  PRIMARY KEY (device_id, mapping_version, sensor_code),
  UNIQUE (device_id, mapping_version, gpio),
  UNIQUE (device_id, mapping_version, sensor_code, checkpoint_code),
  FOREIGN KEY (device_id, mapping_version)
    REFERENCES device_mapping_versions(device_id, version)
);

-- Raw materials, orders and per-garment lineage.
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE material_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_lot_ref text,
  receipt_ref text,
  material_name text NOT NULL,
  unit quantity_unit NOT NULL,
  received_quantity numeric(14, 3) NOT NULL CHECK (received_quantity > 0),
  available_accepted_quantity numeric(14, 3) NOT NULL DEFAULT 0,
  received_by uuid NOT NULL REFERENCES staff_users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  CHECK (available_accepted_quantity BETWEEN 0 AND received_quantity),
  CHECK (unit <> 'pcs' OR
         (received_quantity = trunc(received_quantity) AND
          available_accepted_quantity = trunc(available_accepted_quantity)))
);
CREATE INDEX material_lots_supplier_idx ON material_lots (supplier_id, received_at DESC);

CREATE TABLE production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id),
  product_spec_version_id uuid NOT NULL REFERENCES product_spec_versions(id),
  planned_quantity integer NOT NULL CHECK (planned_quantity > 0),
  status order_status NOT NULL DEFAULT 'draft',
  planned_for date,
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES staff_users(id),
  approved_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, workflow_version_id),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CHECK (status NOT IN ('approved', 'in_progress', 'completed') OR approved_at IS NOT NULL)
);
CREATE INDEX production_orders_status_idx ON production_orders (status, created_at DESC);

CREATE TABLE cutting_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  production_order_id uuid NOT NULL REFERENCES production_orders(id),
  performed_by uuid NOT NULL REFERENCES staff_users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, production_order_id)
);

CREATE TABLE garments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9][a-z0-9-]{7,127}$'),
  cutting_job_id uuid NOT NULL,
  production_order_id uuid NOT NULL,
  size_label text,
  stage garment_stage NOT NULL DEFAULT 'cut',
  quality_disposition quality_status NOT NULL DEFAULT 'awaiting_inspection',
  created_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, cutting_job_id),
  UNIQUE (id, public_id),
  FOREIGN KEY (cutting_job_id, production_order_id)
    REFERENCES cutting_jobs(id, production_order_id)
);
CREATE INDEX garments_order_idx ON garments (production_order_id, code);
CREATE INDEX garments_progress_idx ON garments (stage, quality_disposition);

-- Optional future tag bindings. The IR board does not populate this table.
CREATE TABLE garment_tag_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id uuid NOT NULL REFERENCES garments(id),
  tag_technology text NOT NULL,
  tag_identifier text NOT NULL CHECK (btrim(tag_identifier) <> ''),
  bound_by uuid NOT NULL REFERENCES staff_users(id),
  bound_at timestamptz NOT NULL DEFAULT now(),
  unbound_by uuid REFERENCES staff_users(id),
  unbound_at timestamptz,
  CHECK ((unbound_by IS NULL) = (unbound_at IS NULL)),
  CHECK (unbound_at IS NULL OR unbound_at >= bound_at)
);
CREATE UNIQUE INDEX garment_tags_active_identifier_uq
  ON garment_tag_bindings (tag_technology, tag_identifier) WHERE unbound_at IS NULL;
CREATE UNIQUE INDEX garment_tags_active_garment_uq
  ON garment_tag_bindings (garment_id) WHERE unbound_at IS NULL;

-- Quality. A submitted inspection is immutable. Reinspection creates a new row.
CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  scope inspection_scope NOT NULL,
  checklist_version_id uuid NOT NULL,
  material_lot_id uuid REFERENCES material_lots(id),
  garment_id uuid REFERENCES garments(id),
  prior_inspection_id uuid,
  inspector_id uuid NOT NULL REFERENCES staff_users(id),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  notes text,
  defect_reason text,
  outcome inspection_outcome,
  sampled_quantity numeric(14, 3) CHECK (sampled_quantity > 0),
  accepted_quantity numeric(14, 3) CHECK (accepted_quantity >= 0),
  held_quantity numeric(14, 3) CHECK (held_quantity >= 0),
  rejected_quantity numeric(14, 3) CHECK (rejected_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (id, garment_id),
  UNIQUE (id, material_lot_id),
  FOREIGN KEY (checklist_version_id, scope) REFERENCES checklist_versions(id, scope),
  FOREIGN KEY (prior_inspection_id, garment_id) REFERENCES inspections(id, garment_id),
  CHECK (num_nonnulls(material_lot_id, garment_id) = 1),
  CHECK ((scope = 'incoming') = (material_lot_id IS NOT NULL)),
  CHECK ((scope = 'reinspection') = (prior_inspection_id IS NOT NULL)),
  CHECK (prior_inspection_id IS DISTINCT FROM id),
  CHECK ((outcome IS NULL) = (submitted_at IS NULL)),
  CHECK (submitted_at IS NULL OR submitted_at >= created_at),
  CHECK (outcome IS DISTINCT FROM 'fail' OR
         (defect_reason IS NOT NULL AND btrim(defect_reason) <> '')),
  CHECK (scope = 'incoming' OR
         num_nonnulls(sampled_quantity, accepted_quantity, held_quantity, rejected_quantity) = 0),
  CHECK (scope <> 'incoming' OR submitted_at IS NULL OR
         (num_nonnulls(accepted_quantity, held_quantity, rejected_quantity) = 3 AND
          accepted_quantity + held_quantity + rejected_quantity > 0))
);
CREATE INDEX inspections_garment_idx ON inspections (garment_id, created_at DESC);
CREATE INDEX inspections_lot_idx ON inspections (material_lot_id, created_at DESC);
CREATE INDEX inspections_queue_idx ON inspections (inspector_id, scope, created_at)
  WHERE submitted_at IS NULL;

CREATE TABLE garment_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id uuid NOT NULL REFERENCES garments(id),
  kind hold_kind NOT NULL,
  origin_inspection_id uuid,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  opened_by uuid NOT NULL REFERENCES staff_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES staff_users(id),
  released_at timestamptz,
  release_inspection_id uuid,
  release_reason text,
  UNIQUE (id, garment_id),
  FOREIGN KEY (origin_inspection_id, garment_id) REFERENCES inspections(id, garment_id),
  FOREIGN KEY (release_inspection_id, garment_id) REFERENCES inspections(id, garment_id),
  CHECK (kind <> 'quality' OR origin_inspection_id IS NOT NULL),
  CHECK ((released_at IS NULL) = (released_by IS NULL)),
  CHECK (released_at IS NOT NULL OR release_inspection_id IS NULL),
  CHECK (released_at IS NULL OR
         (released_at >= opened_at AND release_reason IS NOT NULL AND btrim(release_reason) <> '')),
  CHECK (released_at IS NULL OR kind <> 'quality' OR release_inspection_id IS NOT NULL),
  CHECK (release_inspection_id IS NULL OR release_inspection_id IS DISTINCT FROM origin_inspection_id)
);
CREATE UNIQUE INDEX garment_holds_origin_inspection_uq
  ON garment_holds (origin_inspection_id) WHERE kind = 'quality';
CREATE INDEX garment_holds_active_idx ON garment_holds (garment_id, kind)
  WHERE released_at IS NULL;

CREATE TABLE rework_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  garment_id uuid NOT NULL,
  hold_id uuid NOT NULL,
  status rework_status NOT NULL DEFAULT 'open',
  description text NOT NULL,
  opened_by uuid NOT NULL REFERENCES staff_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  assigned_department_code text REFERENCES departments(code),
  assigned_by uuid REFERENCES staff_users(id),
  assigned_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, garment_id),
  UNIQUE (hold_id),
  FOREIGN KEY (hold_id, garment_id) REFERENCES garment_holds(id, garment_id),
  CHECK (num_nonnulls(assigned_department_code, assigned_by, assigned_at) IN (0, 3)),
  CHECK (status NOT IN ('assigned', 'repair_recorded', 'closed') OR assigned_at IS NOT NULL)
);
CREATE INDEX rework_cases_queue_idx ON rework_cases (status, assigned_department_code);

CREATE TABLE repair_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rework_case_id uuid NOT NULL,
  garment_id uuid NOT NULL,
  performed_by uuid NOT NULL REFERENCES staff_users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  work_summary text NOT NULL CHECK (btrim(work_summary) <> ''),
  reinspection_id uuid NOT NULL,
  UNIQUE (reinspection_id),
  FOREIGN KEY (rework_case_id, garment_id) REFERENCES rework_cases(id, garment_id),
  FOREIGN KEY (reinspection_id, garment_id) REFERENCES inspections(id, garment_id)
);

-- The lot balance is updated atomically when an immutable stock movement is inserted.
-- Cutting consumption and waste draw from a specific issue, rather than from free stock.
CREATE TABLE material_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_lot_id uuid NOT NULL REFERENCES material_lots(id),
  kind material_movement_kind NOT NULL,
  production_order_id uuid REFERENCES production_orders(id),
  inspection_id uuid,
  original_issue_id uuid,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  performed_by uuid NOT NULL REFERENCES staff_users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, material_lot_id, production_order_id, kind),
  FOREIGN KEY (inspection_id, material_lot_id) REFERENCES inspections(id, material_lot_id),
  FOREIGN KEY (original_issue_id) REFERENCES material_stock_movements(id),
  CHECK ((kind = 'accepted') = (inspection_id IS NOT NULL)),
  CHECK ((kind IN ('issued', 'unused_return')) = (production_order_id IS NOT NULL)),
  CHECK ((kind = 'unused_return') = (original_issue_id IS NOT NULL))
);
CREATE INDEX material_stock_movements_lot_idx
  ON material_stock_movements (material_lot_id, performed_at DESC);
CREATE INDEX material_stock_movements_inspection_idx
  ON material_stock_movements (inspection_id) WHERE inspection_id IS NOT NULL;
CREATE INDEX material_stock_movements_return_idx
  ON material_stock_movements (original_issue_id) WHERE original_issue_id IS NOT NULL;

CREATE TABLE cutting_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cutting_job_id uuid NOT NULL,
  production_order_id uuid NOT NULL,
  material_lot_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  issue_kind material_movement_kind NOT NULL DEFAULT 'issued' CHECK (issue_kind = 'issued'),
  consumed_quantity numeric(14, 3) NOT NULL CHECK (consumed_quantity > 0),
  waste_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (waste_quantity >= 0),
  UNIQUE (id, cutting_job_id),
  UNIQUE (cutting_job_id, issue_id),
  FOREIGN KEY (cutting_job_id, production_order_id)
    REFERENCES cutting_jobs(id, production_order_id),
  FOREIGN KEY (issue_id, material_lot_id, production_order_id, issue_kind)
    REFERENCES material_stock_movements(id, material_lot_id, production_order_id, kind)
);
CREATE INDEX cutting_inputs_issue_idx ON cutting_inputs (issue_id);

CREATE TABLE garment_material_inputs (
  garment_id uuid NOT NULL,
  cutting_job_id uuid NOT NULL,
  cutting_input_id uuid NOT NULL,
  attributed_quantity numeric(14, 3) CHECK (attributed_quantity > 0),
  PRIMARY KEY (garment_id, cutting_input_id),
  FOREIGN KEY (garment_id, cutting_job_id) REFERENCES garments(id, cutting_job_id),
  FOREIGN KEY (cutting_input_id, cutting_job_id) REFERENCES cutting_inputs(id, cutting_job_id)
);
CREATE INDEX garment_material_inputs_input_idx ON garment_material_inputs (cutting_input_id);

-- Finished-goods logistics. Staff record membership and movement explicitly.
CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  status package_status NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

CREATE TABLE package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES packages(id),
  garment_id uuid NOT NULL REFERENCES garments(id),
  added_by uuid NOT NULL REFERENCES staff_users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES staff_users(id),
  removed_at timestamptz,
  CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  CHECK (removed_at IS NULL OR removed_at >= added_at)
);
CREATE UNIQUE INDEX package_items_active_garment_uq ON package_items (garment_id)
  WHERE removed_at IS NULL;
CREATE INDEX package_items_package_idx ON package_items (package_id, garment_id)
  WHERE removed_at IS NULL;

CREATE TABLE warehouse_bins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES packages(id),
  from_bin_id uuid REFERENCES warehouse_bins(id),
  to_bin_id uuid REFERENCES warehouse_bins(id),
  performed_by uuid NOT NULL REFERENCES staff_users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  CHECK (from_bin_id IS DISTINCT FROM to_bin_id)
);
CREATE INDEX warehouse_movements_package_idx ON warehouse_movements (package_id, performed_at DESC);

CREATE TABLE warehouse_stock (
  package_id uuid PRIMARY KEY REFERENCES packages(id),
  current_bin_id uuid NOT NULL REFERENCES warehouse_bins(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE INDEX warehouse_stock_bin_idx ON warehouse_stock (current_bin_id);

CREATE TABLE carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  status shipment_status NOT NULL DEFAULT 'draft',
  carrier_id uuid REFERENCES carriers(id),
  destination_details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(destination_details) = 'object'),
  tracking_reference text,
  planned_at timestamptz,
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES staff_users(id),
  approved_at timestamptz,
  departed_by uuid REFERENCES staff_users(id),
  departed_at timestamptz,
  delivered_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK ((departed_by IS NULL) = (departed_at IS NULL)),
  CHECK (status NOT IN ('approved', 'dispatched', 'delivered') OR approved_at IS NOT NULL),
  CHECK ((status IN ('dispatched', 'delivered')) = (departed_at IS NOT NULL)),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CHECK (departed_at IS NULL OR (approved_at IS NOT NULL AND departed_at >= approved_at)),
  CHECK (delivered_at IS NULL OR delivered_at >= departed_at)
);
CREATE INDEX shipments_status_idx ON shipments (status, planned_at);

CREATE TABLE shipment_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  package_id uuid NOT NULL REFERENCES packages(id),
  allocated_by uuid NOT NULL REFERENCES staff_users(id),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  deallocated_by uuid REFERENCES staff_users(id),
  deallocated_at timestamptz,
  CHECK ((deallocated_at IS NULL) = (deallocated_by IS NULL)),
  CHECK (deallocated_at IS NULL OR deallocated_at >= allocated_at)
);
CREATE UNIQUE INDEX shipment_packages_active_package_uq ON shipment_packages (package_id)
  WHERE deallocated_at IS NULL;
CREATE INDEX shipment_packages_shipment_idx ON shipment_packages (shipment_id)
  WHERE deallocated_at IS NULL;

CREATE TABLE garment_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  garment_id uuid NOT NULL REFERENCES garments(id),
  original_shipment_id uuid NOT NULL REFERENCES shipments(id),
  status return_status NOT NULL DEFAULT 'received',
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  received_by uuid NOT NULL REFERENCES staff_users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  inspection_id uuid,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  FOREIGN KEY (inspection_id, garment_id) REFERENCES inspections(id, garment_id)
);
CREATE INDEX garment_returns_garment_idx ON garment_returns (garment_id, received_at DESC);

-- Staff tasks and context-bound observations. Sensor presence never writes a QC result.
CREATE TABLE work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code text NOT NULL,
  department_code text NOT NULL REFERENCES departments(code),
  checkpoint_code text REFERENCES checkpoints(code),
  workflow_version_id uuid,
  workflow_step_code text,
  material_lot_id uuid REFERENCES material_lots(id),
  garment_id uuid REFERENCES garments(id),
  package_id uuid REFERENCES packages(id),
  production_order_id uuid REFERENCES production_orders(id),
  shipment_id uuid REFERENCES shipments(id),
  predecessor_task_id uuid REFERENCES work_tasks(id),
  status task_status NOT NULL DEFAULT 'queued',
  created_by uuid NOT NULL REFERENCES staff_users(id),
  assignee_id uuid REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, checkpoint_code),
  FOREIGN KEY (workflow_version_id, workflow_step_code)
    REFERENCES workflow_steps(workflow_version_id, step_code) MATCH FULL,
  CHECK (num_nonnulls(material_lot_id, garment_id, package_id, production_order_id) = 1),
  CHECK (shipment_id IS NULL OR num_nonnulls(garment_id, package_id) = 1),
  CHECK (predecessor_task_id IS DISTINCT FROM id),
  CHECK (status NOT IN ('assigned', 'claimed', 'in_progress', 'completed') OR assignee_id IS NOT NULL),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR completed_at >= created_at)
);
CREATE INDEX work_tasks_department_queue_idx
  ON work_tasks (department_code, status, created_at);
CREATE INDEX work_tasks_assignee_idx ON work_tasks (assignee_id, status);
CREATE INDEX work_tasks_garment_idx ON work_tasks (garment_id) WHERE garment_id IS NOT NULL;

CREATE TABLE capture_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  material_lot_id uuid REFERENCES material_lots(id),
  garment_id uuid REFERENCES garments(id),
  package_id uuid REFERENCES packages(id),
  opened_by uuid NOT NULL REFERENCES staff_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES staff_users(id),
  closed_at timestamptz,
  close_reason text,
  UNIQUE (id, device_id),
  CHECK (num_nonnulls(material_lot_id, garment_id, package_id) = 1),
  CHECK ((closed_by IS NULL) = (closed_at IS NULL)),
  CHECK (closed_at IS NULL OR
         (closed_at >= opened_at AND close_reason IS NOT NULL AND btrim(close_reason) <> ''))
);
CREATE UNIQUE INDEX capture_runs_active_device_uq ON capture_runs (device_id)
  WHERE closed_at IS NULL;

CREATE TABLE capture_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_token text NOT NULL UNIQUE CHECK (length(context_token) BETWEEN 16 AND 128),
  capture_run_id uuid NOT NULL,
  device_id uuid NOT NULL,
  task_id uuid NOT NULL,
  operator_id uuid NOT NULL REFERENCES staff_users(id),
  checkpoint_code text NOT NULL,
  mapping_version integer NOT NULL,
  sensor_code text NOT NULL,
  status capture_status NOT NULL DEFAULT 'awaiting_ack',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  cleared_at timestamptz,
  armed_at timestamptz,
  closed_at timestamptz,
  UNIQUE (id, device_id, context_token),
  FOREIGN KEY (capture_run_id, device_id) REFERENCES capture_runs(id, device_id),
  FOREIGN KEY (task_id, checkpoint_code) REFERENCES work_tasks(id, checkpoint_code),
  FOREIGN KEY (device_id, mapping_version, sensor_code, checkpoint_code)
    REFERENCES device_sensor_mappings(device_id, mapping_version, sensor_code, checkpoint_code),
  CHECK (expires_at > created_at),
  CHECK (acknowledged_at IS NULL OR
         (acknowledged_at >= created_at AND acknowledged_at < expires_at)),
  CHECK (cleared_at IS NULL OR
         (acknowledged_at IS NOT NULL AND cleared_at >= acknowledged_at AND cleared_at < expires_at)),
  CHECK (armed_at IS NULL OR
         (cleared_at IS NOT NULL AND armed_at >= cleared_at AND armed_at < expires_at)),
  CHECK (status <> 'awaiting_clear' OR acknowledged_at IS NOT NULL),
  CHECK (status NOT IN ('armed', 'completed') OR armed_at IS NOT NULL),
  CHECK ((status IN ('completed', 'expired', 'cancelled')) = (closed_at IS NOT NULL)),
  CHECK (closed_at IS NULL OR closed_at >= coalesce(armed_at, cleared_at, acknowledged_at, created_at))
);
CREATE UNIQUE INDEX capture_steps_active_device_uq ON capture_steps (device_id)
  WHERE closed_at IS NULL;
CREATE UNIQUE INDEX capture_steps_completed_task_uq ON capture_steps (task_id)
  WHERE status = 'completed';

CREATE TABLE sensor_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 128),
  boot_id text NOT NULL CHECK (length(boot_id) BETWEEN 1 AND 128),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  reported_context_token text CHECK (length(reported_context_token) BETWEEN 1 AND 128),
  resolved_step_id uuid,
  sensor_code text NOT NULL CHECK (length(sensor_code) BETWEEN 1 AND 32),
  edge sensor_edge NOT NULL,
  device_uptime_ms bigint NOT NULL CHECK (device_uptime_ms >= 0),
  reported_mapping_version integer NOT NULL CHECK (reported_mapping_version > 0),
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  received_at timestamptz NOT NULL DEFAULT now(),
  resolution observation_resolution NOT NULL,
  resolution_reason text,
  UNIQUE (device_id, event_id),
  UNIQUE (device_id, boot_id, sequence),
  FOREIGN KEY (resolved_step_id, device_id, reported_context_token)
    REFERENCES capture_steps(id, device_id, context_token),
  CHECK (resolved_step_id IS NULL OR reported_context_token IS NOT NULL),
  CHECK (resolution <> 'accepted' OR
         (resolved_step_id IS NOT NULL AND edge = 'OBJECT_DETECTED')),
  CHECK (resolution <> 'quarantined' OR
         (resolution_reason IS NOT NULL AND btrim(resolution_reason) <> ''))
);
CREATE UNIQUE INDEX sensor_observations_accepted_step_uq
  ON sensor_observations (resolved_step_id) WHERE resolution = 'accepted';
CREATE INDEX sensor_observations_device_time_idx
  ON sensor_observations (device_id, received_at DESC);

-- An accepted business event is separate from its raw observation.
-- Append it, update its subject revision and enqueue any commitment in one transaction.
CREATE TABLE trace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]*$'),
  material_lot_id uuid REFERENCES material_lots(id),
  production_order_id uuid REFERENCES production_orders(id),
  garment_id uuid REFERENCES garments(id),
  package_id uuid REFERENCES packages(id),
  shipment_id uuid REFERENCES shipments(id),
  subject_type text GENERATED ALWAYS AS (
    CASE WHEN material_lot_id IS NOT NULL THEN 'material_lot'
         WHEN production_order_id IS NOT NULL THEN 'production_order'
         WHEN garment_id IS NOT NULL THEN 'garment'
         WHEN package_id IS NOT NULL THEN 'package'
         ELSE 'shipment' END
  ) STORED,
  subject_id uuid GENERATED ALWAYS AS (
    coalesce(material_lot_id, production_order_id, garment_id, package_id, shipment_id)
  ) STORED,
  subject_revision integer NOT NULL CHECK (subject_revision > 0),
  actor_id uuid NOT NULL REFERENCES staff_users(id),
  task_id uuid REFERENCES work_tasks(id),
  observation_id uuid REFERENCES sensor_observations(id),
  corrects_event_id uuid,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, subject_revision),
  UNIQUE (id, subject_type, subject_id),
  FOREIGN KEY (corrects_event_id, subject_type, subject_id)
    REFERENCES trace_events(id, subject_type, subject_id),
  CHECK (num_nonnulls(material_lot_id, production_order_id, garment_id, package_id, shipment_id) = 1),
  CHECK (corrects_event_id IS DISTINCT FROM id),
  CHECK (corrects_event_id IS NULL OR (reason IS NOT NULL AND btrim(reason) <> ''))
);
CREATE INDEX trace_events_garment_idx ON trace_events (garment_id, subject_revision DESC)
  WHERE garment_id IS NOT NULL;

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid REFERENCES staff_users(id),
  actor_device_id uuid REFERENCES devices(id),
  department_code text REFERENCES departments(code),
  action_code text NOT NULL,
  target_type text NOT NULL,
  target_reference text NOT NULL,
  request_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(actor_staff_id, actor_device_id) <= 1)
);
CREATE INDEX audit_events_time_idx ON audit_events (recorded_at DESC);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_reference, recorded_at DESC);
CREATE INDEX audit_events_dept_idx ON audit_events (department_code, recorded_at DESC);

-- Reserve and complete a key in the same transaction as an operational mutation.
-- Do not persist cookies, reset links or authorization tokens in response_body.
CREATE TABLE api_idempotency_keys (
  staff_user_id uuid NOT NULL REFERENCES staff_users(id),
  operation_code text NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128),
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  response_status smallint CHECK (response_status BETWEEN 200 AND 599),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (staff_user_id, operation_code, request_key),
  CHECK (expires_at > created_at),
  CHECK (response_status IS NOT NULL OR response_body IS NULL)
);
CREATE INDEX api_idempotency_keys_expiry_idx ON api_idempotency_keys (expires_at);

-- Exact approved UTF-8 bytes for the public response and proof download.
-- The backend builds an allowlisted public projection, canonically serializes it
-- and includes publicId, schemaVersion, version and scoped milestones.
CREATE TABLE public_payload_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id uuid NOT NULL,
  public_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload_bytes bytea NOT NULL CHECK (octet_length(payload_bytes) > 0),
  payload_sha256 bytea GENERATED ALWAYS AS (sha256(payload_bytes)) STORED,
  approved_by uuid NOT NULL REFERENCES staff_users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (public_id, version),
  UNIQUE (id, payload_sha256),
  FOREIGN KEY (garment_id, public_id) REFERENCES garments(id, public_id),
  CHECK (jsonb_typeof(convert_from(payload_bytes, 'UTF8')::jsonb) = 'object'),
  CHECK ((convert_from(payload_bytes, 'UTF8')::jsonb ->> 'publicId') IS NOT DISTINCT FROM public_id),
  CHECK ((convert_from(payload_bytes, 'UTF8')::jsonb -> 'version') IS NOT DISTINCT FROM to_jsonb(version)),
  CHECK ((convert_from(payload_bytes, 'UTF8')::jsonb -> 'schemaVersion') IS NOT DISTINCT FROM
         to_jsonb(schema_version))
);

-- Counts are per identifier and time bucket. They count requests, not garments or people.
CREATE TABLE public_lookup_buckets (
  garment_id uuid NOT NULL REFERENCES garments(id),
  bucket_start timestamptz NOT NULL,
  lookup_count bigint NOT NULL DEFAULT 0 CHECK (lookup_count >= 0),
  PRIMARY KEY (garment_id, bucket_start),
  CHECK (bucket_start = date_trunc('hour', bucket_start, 'UTC'))
);
CREATE INDEX public_lookup_buckets_time_idx ON public_lookup_buckets (bucket_start);

CREATE TABLE identifier_activity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id uuid NOT NULL REFERENCES garments(id),
  rule_code text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  observed_count bigint NOT NULL CHECK (observed_count > 0),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES staff_users(id),
  resolved_at timestamptz,
  CHECK (window_end > window_start),
  CHECK (resolved_at IS NULL OR resolved_at >= triggered_at),
  CHECK ((resolved_by IS NULL) = (resolved_at IS NULL)),
  UNIQUE (garment_id, rule_code, window_start, window_end)
);
CREATE INDEX identifier_activity_alerts_active_idx ON identifier_activity_alerts (garment_id)
  WHERE resolved_at IS NULL;

-- The deployment code changes if the local chain is reset or the contract is redeployed.
-- Hex addresses, commitment IDs and hashes are stored as raw bytes.
CREATE TABLE ledger_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  chain_id numeric(78, 0) NOT NULL CHECK (chain_id > 0),
  network_name text NOT NULL,
  contract_address bytea NOT NULL CHECK (octet_length(contract_address) = 20),
  deployment_tx_hash bytea NOT NULL CHECK (octet_length(deployment_tx_hash) = 32),
  protocol_version integer NOT NULL CHECK (protocol_version > 0),
  registered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES ledger_deployments(id),
  commitment_id bytea NOT NULL CHECK (octet_length(commitment_id) = 32),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  trace_event_id uuid REFERENCES trace_events(id),
  public_payload_id uuid,
  internal_payload_bytes bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, commitment_id),
  UNIQUE (id, deployment_id),
  FOREIGN KEY (public_payload_id, payload_sha256)
    REFERENCES public_payload_versions(id, payload_sha256),
  CHECK (num_nonnulls(trace_event_id, public_payload_id) = 1),
  CHECK ((internal_payload_bytes IS NOT NULL) = (trace_event_id IS NOT NULL)),
  CHECK (internal_payload_bytes IS NULL OR
         (octet_length(internal_payload_bytes) > 0 AND sha256(internal_payload_bytes) = payload_sha256))
);
CREATE UNIQUE INDEX ledger_commitments_event_uq ON ledger_commitments (deployment_id, trace_event_id)
  WHERE trace_event_id IS NOT NULL;
CREATE UNIQUE INDEX ledger_commitments_public_uq ON ledger_commitments (deployment_id, public_payload_id)
  WHERE public_payload_id IS NOT NULL;

CREATE TABLE ledger_outbox (
  commitment_id uuid PRIMARY KEY REFERENCES ledger_commitments(id),
  status ledger_job_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_summary text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  retry_requested_by uuid REFERENCES staff_users(id),
  retry_requested_at timestamptz,
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (status <> 'confirmed' OR lease_token IS NULL),
  CHECK ((retry_requested_by IS NULL) = (retry_requested_at IS NULL))
);
CREATE INDEX ledger_outbox_ready_idx ON ledger_outbox (next_attempt_at, lease_expires_at)
  WHERE status IN ('pending', 'submitted');
CREATE INDEX ledger_outbox_status_idx ON ledger_outbox (status, updated_at DESC);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  tx_hash bytea NOT NULL CHECK (octet_length(tx_hash) = 32),
  status ledger_tx_status NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  block_number bigint CHECK (block_number >= 0),
  block_hash bytea CHECK (octet_length(block_hash) = 32),
  block_timestamp timestamptz,
  confirmed_at timestamptz,
  UNIQUE (deployment_id, tx_hash),
  FOREIGN KEY (commitment_id, deployment_id) REFERENCES ledger_commitments(id, deployment_id),
  CHECK (status <> 'confirmed' OR num_nonnulls(block_number, block_hash, block_timestamp, confirmed_at) = 4),
  CHECK (confirmed_at IS NULL OR confirmed_at >= submitted_at)
);
CREATE UNIQUE INDEX ledger_transactions_confirmed_uq ON ledger_transactions (commitment_id)
  WHERE status = 'confirmed';
CREATE INDEX ledger_transactions_commitment_idx ON ledger_transactions (commitment_id, submitted_at DESC);

-- Protect historical facts. Corrections and reinspections append new records.
CREATE FUNCTION forbid_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
BEGIN
  RAISE EXCEPTION '% history is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION protect_submitted_inspection() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'submitted inspections are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inspections_protect_submitted
  BEFORE UPDATE OR DELETE ON inspections
  FOR EACH ROW EXECUTE FUNCTION protect_submitted_inspection();

CREATE FUNCTION check_quality_hold_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
BEGIN
  -- Serialize holds with packing and dispatch checks on the same garment.
  PERFORM 1 FROM garments WHERE id = NEW.garment_id FOR NO KEY UPDATE;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.released_at IS NOT NULL OR
       ROW(NEW.id, NEW.garment_id, NEW.kind, NEW.origin_inspection_id, NEW.reason, NEW.opened_by, NEW.opened_at)
         IS DISTINCT FROM
       ROW(OLD.id, OLD.garment_id, OLD.kind, OLD.origin_inspection_id, OLD.reason, OLD.opened_by, OLD.opened_at) THEN
      RAISE EXCEPTION 'cannot rewrite hold history' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.kind = 'quality' THEN
    IF NOT EXISTS (
      SELECT 1 FROM inspections
      WHERE id = NEW.origin_inspection_id AND garment_id = NEW.garment_id
        AND outcome = 'fail' AND submitted_at <= NEW.opened_at
    ) THEN
      RAISE EXCEPTION 'quality hold requires a submitted failing inspection' USING ERRCODE = '23514';
    END IF;

    IF NEW.released_at IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM inspections i
      JOIN repair_records r ON r.reinspection_id = i.id
      JOIN rework_cases c ON c.id = r.rework_case_id AND c.hold_id = NEW.id
      WHERE i.id = NEW.release_inspection_id AND i.garment_id = NEW.garment_id
        AND i.scope = 'reinspection' AND i.outcome = 'pass'
        AND i.submitted_at BETWEEN r.performed_at AND NEW.released_at
        AND r.performed_at >= NEW.opened_at AND i.inspector_id <> r.performed_by
    ) THEN
      RAISE EXCEPTION 'quality release requires an independent passing reinspection after recorded repair'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER garment_holds_validate_evidence
  BEFORE INSERT OR UPDATE ON garment_holds
  FOR EACH ROW EXECUTE FUNCTION check_quality_hold_evidence();
CREATE TRIGGER garment_holds_protect_delete
  BEFORE DELETE ON garment_holds
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();

CREATE FUNCTION check_package_item_eligibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE
  current_package_status package_status;
  current_quality quality_status;
BEGIN
  SELECT status INTO current_package_status FROM packages
  WHERE id = NEW.package_id FOR NO KEY UPDATE;
  IF current_package_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'a garment can only be packed into an open package' USING ERRCODE = '23514';
  END IF;

  SELECT quality_disposition INTO current_quality FROM garments
  WHERE id = NEW.garment_id FOR NO KEY UPDATE;
  IF current_quality IS DISTINCT FROM 'released' OR EXISTS (
    SELECT 1 FROM garment_holds WHERE garment_id = NEW.garment_id AND released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a garment on hold or awaiting release cannot be packed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER package_items_check_eligibility
  BEFORE INSERT ON package_items
  FOR EACH ROW EXECUTE FUNCTION check_package_item_eligibility();

CREATE FUNCTION check_shipment_departure() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.departed_at IS NOT NULL THEN
      RAISE EXCEPTION 'record the shipment and its manifest before dispatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.departed_at IS NOT NULL THEN
    IF NEW.departed_at IS DISTINCT FROM OLD.departed_at OR
       NEW.departed_by IS DISTINCT FROM OLD.departed_by THEN
      RAISE EXCEPTION 'cannot overwrite departure evidence' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.departed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'approved' OR NEW.status <> 'dispatched' THEN
    RAISE EXCEPTION 'only an approved shipment can be dispatched' USING ERRCODE = '23514';
  END IF;

  PERFORM p.id FROM packages p
  JOIN shipment_packages sp ON sp.package_id = p.id
  WHERE sp.shipment_id = NEW.id AND sp.deallocated_at IS NULL
  ORDER BY p.id FOR NO KEY UPDATE OF p;

  PERFORM g.id FROM garments g
  WHERE EXISTS (
    SELECT 1 FROM shipment_packages sp
    JOIN package_items pi ON pi.package_id = sp.package_id AND pi.removed_at IS NULL
    WHERE sp.shipment_id = NEW.id AND sp.deallocated_at IS NULL AND pi.garment_id = g.id
  )
  ORDER BY g.id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a dispatch manifest must contain garments' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM shipment_packages sp
    JOIN package_items pi ON pi.package_id = sp.package_id AND pi.removed_at IS NULL
    JOIN garments g ON g.id = pi.garment_id
    WHERE sp.shipment_id = NEW.id AND sp.deallocated_at IS NULL
      AND (g.quality_disposition <> 'released' OR EXISTS (
        SELECT 1 FROM garment_holds h WHERE h.garment_id = g.id AND h.released_at IS NULL
      ))
  ) THEN
    RAISE EXCEPTION 'a shipment with a held or unreleased garment cannot depart'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shipments_check_departure
  BEFORE INSERT OR UPDATE OF status, departed_at, departed_by ON shipments
  FOR EACH ROW EXECUTE FUNCTION check_shipment_departure();

CREATE FUNCTION check_accepted_observation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
BEGIN
  IF NEW.resolution = 'accepted' AND NOT EXISTS (
    SELECT 1 FROM capture_steps s
    JOIN capture_runs r ON r.id = s.capture_run_id
    JOIN work_tasks t ON t.id = s.task_id
    WHERE s.id = NEW.resolved_step_id AND s.device_id = NEW.device_id
      AND s.status = 'armed' AND r.closed_at IS NULL
      AND s.sensor_code = NEW.sensor_code AND s.mapping_version = NEW.reported_mapping_version
      AND NEW.received_at >= s.armed_at AND NEW.received_at < s.expires_at
      AND t.assignee_id = s.operator_id AND t.status IN ('claimed', 'in_progress')
      AND ROW(t.material_lot_id, t.garment_id, t.package_id)
          IS NOT DISTINCT FROM ROW(r.material_lot_id, r.garment_id, r.package_id)
  ) THEN
    RAISE EXCEPTION 'accepted observation must match the armed subject and checkpoint'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sensor_observations_check_accepted
  BEFORE INSERT ON sensor_observations
  FOR EACH ROW EXECUTE FUNCTION check_accepted_observation();

-- Serialize changes to each accepted lot balance. Accept and issue cannot silently
-- oversubscribe the same roll. The same issued quantity cannot be cut and returned twice.
CREATE FUNCTION apply_material_stock_movement() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE
  delta numeric;
  lot_unit quantity_unit;
  received_total numeric;
  allowed_quantity numeric;
  used_quantity numeric;
BEGIN
  delta := CASE WHEN NEW.kind IN ('issued', 'adjustment_remove') THEN -NEW.quantity
                ELSE NEW.quantity END;

  UPDATE material_lots
  SET available_accepted_quantity = available_accepted_quantity + delta
  WHERE id = NEW.material_lot_id
    AND available_accepted_quantity + delta BETWEEN 0 AND received_quantity
  RETURNING unit, received_quantity INTO lot_unit, received_total;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material movement exceeds the lot balance' USING ERRCODE = '23514';
  END IF;
  IF lot_unit = 'pcs' AND NEW.quantity <> trunc(NEW.quantity) THEN
    RAISE EXCEPTION 'piece quantities must be whole numbers' USING ERRCODE = '23514';
  END IF;

  IF NEW.kind = 'accepted' THEN
    SELECT accepted_quantity INTO allowed_quantity
    FROM inspections
    WHERE id = NEW.inspection_id AND material_lot_id = NEW.material_lot_id
      AND scope = 'incoming' AND submitted_at <= NEW.performed_at;
    SELECT coalesce(sum(quantity), 0) INTO used_quantity
    FROM material_stock_movements WHERE inspection_id = NEW.inspection_id;
    IF allowed_quantity IS NULL OR used_quantity > allowed_quantity THEN
      RAISE EXCEPTION 'quantity exceeds the incoming inspection acceptance' USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum(quantity), 0) INTO used_quantity
    FROM material_stock_movements WHERE material_lot_id = NEW.material_lot_id AND kind = 'accepted';
    IF used_quantity > received_total THEN
      RAISE EXCEPTION 'total accepted quantity exceeds the received quantity' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.kind = 'issued' THEN
    PERFORM 1 FROM production_orders WHERE id = NEW.production_order_id
      AND status IN ('approved', 'in_progress') FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material can only be issued to an approved or active order' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.kind = 'unused_return' THEN
    SELECT quantity INTO allowed_quantity FROM material_stock_movements
    WHERE id = NEW.original_issue_id AND material_lot_id = NEW.material_lot_id
      AND production_order_id = NEW.production_order_id AND kind = 'issued';
    SELECT coalesce(sum(consumed_quantity + waste_quantity), 0) INTO used_quantity
    FROM cutting_inputs WHERE issue_id = NEW.original_issue_id;
    SELECT used_quantity + coalesce(sum(quantity), 0) INTO used_quantity
    FROM material_stock_movements WHERE original_issue_id = NEW.original_issue_id;
    IF allowed_quantity IS NULL OR used_quantity > allowed_quantity THEN
      RAISE EXCEPTION 'return exceeds remaining quantity on the original issue' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER material_stock_movements_apply
  AFTER INSERT ON material_stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_material_stock_movement();

CREATE FUNCTION check_cutting_input_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE
  lot_unit quantity_unit;
  allowed_quantity numeric;
  used_quantity numeric;
BEGIN
  -- Lock the same lot row used by the unused-return operation.
  SELECT unit INTO lot_unit FROM material_lots WHERE id = NEW.material_lot_id FOR UPDATE;
  IF lot_unit = 'pcs' AND
     (NEW.consumed_quantity <> trunc(NEW.consumed_quantity) OR
      NEW.waste_quantity <> trunc(NEW.waste_quantity)) THEN
    RAISE EXCEPTION 'piece quantities must be whole numbers' USING ERRCODE = '23514';
  END IF;

  SELECT quantity INTO allowed_quantity FROM material_stock_movements
  WHERE id = NEW.issue_id AND material_lot_id = NEW.material_lot_id
    AND production_order_id = NEW.production_order_id AND kind = 'issued';
  SELECT coalesce(sum(consumed_quantity + waste_quantity), 0) INTO used_quantity
  FROM cutting_inputs WHERE issue_id = NEW.issue_id;
  SELECT used_quantity + coalesce(sum(quantity), 0) INTO used_quantity
  FROM material_stock_movements WHERE original_issue_id = NEW.issue_id;
  IF allowed_quantity IS NULL OR
     used_quantity + NEW.consumed_quantity + NEW.waste_quantity > allowed_quantity THEN
    RAISE EXCEPTION 'cutting and waste exceed remaining quantity on the original issue' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cutting_inputs_check_balance
  BEFORE INSERT ON cutting_inputs
  FOR EACH ROW EXECUTE FUNCTION check_cutting_input_balance();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workflow_versions', 'workflow_steps', 'product_spec_versions', 'checklist_versions',
    'cutting_jobs', 'cutting_inputs', 'garment_material_inputs', 'material_stock_movements',
    'repair_records', 'warehouse_movements', 'sensor_observations', 'trace_events',
    'audit_events', 'public_payload_versions', 'ledger_deployments', 'ledger_commitments'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER history_is_immutable BEFORE UPDATE OR DELETE ON supplyease.%I
       FOR EACH ROW EXECUTE FUNCTION supplyease.forbid_history_change()', table_name
    );
  END LOOP;
END;
$$;

INSERT INTO departments (code, name) VALUES
  ('receiving', 'Receiving'),
  ('raw_store', 'Raw material store and issuing'),
  ('cutting', 'Cutting'),
  ('stitching', 'Stitching'),
  ('finishing', 'Finishing and tagging'),
  ('quality', 'Final quality control'),
  ('packing', 'Packing'),
  ('warehouse', 'Finished-goods warehouse'),
  ('dispatch', 'Dispatch');

-- Logical names only. Use bench-verified inputs when provisioning device mappings.
-- Incoming QC belongs to receiving. S4 can also observe final QC presentation.
INSERT INTO checkpoints (code, name, department_code) VALUES
  ('S1', 'Receiving presentation', 'receiving'),
  ('S2', 'Cutting output presentation', 'cutting'),
  ('S3', 'Stitching presentation', 'stitching'),
  ('S4', 'Finishing / final QC presentation', 'finishing'),
  ('S5', 'Packing presentation', 'packing'),
  ('S6', 'Dispatch presentation', 'dispatch');


-- WearTrail RFID and QA extensions
-- This body is shared by the complete installation and the existing-schema upgrade.
-- All names are qualified through a transaction-local private search_path.

CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  description text NOT NULL
);

-- Keep the six historical checkpoint identifiers so existing workflows and IR data survive.
UPDATE checkpoints SET name = 'Fabric Receiving' WHERE code = 'S1';
UPDATE checkpoints SET name = 'Cutting & Tag Assignment' WHERE code = 'S2';
UPDATE checkpoints SET name = 'Stitching' WHERE code = 'S3';
UPDATE checkpoints SET name = 'Finishing' WHERE code = 'S4';
UPDATE checkpoints SET name = 'Packing' WHERE code = 'S5';
UPDATE checkpoints SET name = 'Dispatch' WHERE code = 'S6';
INSERT INTO checkpoints(code, name, department_code) VALUES
  ('RAW_ISSUE', 'Fabric Issue', 'raw_store'),
  ('FINAL_QC', 'Final Quality Check', 'quality'),
  ('WAREHOUSE', 'Finished Goods Warehouse', 'warehouse');

CREATE TABLE rfid_stations (
  code text PRIMARY KEY,
  name text NOT NULL,
  original_board_label text NOT NULL,
  workflow_position smallint NOT NULL UNIQUE CHECK (workflow_position BETWEEN 1 AND 9),
  checkpoint_code text NOT NULL UNIQUE REFERENCES checkpoints(code),
  subject_kind text NOT NULL CHECK (subject_kind IN ('material_lot', 'garment', 'source_and_garment')),
  requires_explicit_context boolean NOT NULL DEFAULT false
);
INSERT INTO rfid_stations VALUES
  ('fabric_receiving', 'Fabric Receiving', 'Raw Material 1', 1, 'S1', 'material_lot', true),
  ('fabric_issue', 'Fabric Issue', 'Raw Material 2', 2, 'RAW_ISSUE', 'material_lot', true),
  ('cutting', 'Cutting & Tag Assignment', 'Manufacturing 1', 3, 'S2', 'source_and_garment', true),
  ('stitching', 'Stitching', 'Stitching', 4, 'S3', 'garment', false),
  ('finishing', 'Finishing', 'Production', 5, 'S4', 'garment', false),
  ('final_qc', 'Final Quality Check', 'Design', 6, 'FINAL_QC', 'garment', true),
  ('packing', 'Packing', 'Packaging', 7, 'S5', 'garment', true),
  ('warehouse', 'Finished Goods Warehouse', 'Manufacturing 2', 8, 'WAREHOUSE', 'garment', true),
  ('dispatch', 'Dispatch', 'Shipping', 9, 'S6', 'garment', true);
COMMENT ON COLUMN rfid_stations.workflow_position IS
  'Logical process order, never an ESP32 reader index. Populate hardware mappings only after testing.';

CREATE TABLE device_reader_mappings (
  device_id uuid NOT NULL,
  mapping_version integer NOT NULL,
  reader_index smallint NOT NULL CHECK (reader_index BETWEEN 0 AND 255),
  station_code text NOT NULL REFERENCES rfid_stations(code),
  physical_label text,
  PRIMARY KEY (device_id, mapping_version, reader_index),
  UNIQUE (device_id, mapping_version, station_code),
  UNIQUE (device_id, mapping_version, reader_index, station_code),
  FOREIGN KEY (device_id, mapping_version) REFERENCES device_mapping_versions(device_id, version)
);

CREATE FUNCTION reject_reader_mapping_after_activation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,supplyease AS $$ BEGIN
  PERFORM 1 FROM device_mapping_versions WHERE device_id=NEW.device_id AND version=NEW.mapping_version
    AND activated_at IS NULL AND bench_verified_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'add reader mappings before bench verification and activation; use a new version for changes' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reader_mapping_before_verification BEFORE INSERT ON device_reader_mappings
  FOR EACH ROW EXECUTE FUNCTION reject_reader_mapping_after_activation();

-- One authoritative lookup space across both raw bundles and garments.
ALTER TABLE garment_tag_bindings RENAME TO rfid_tag_bindings;
ALTER TABLE rfid_tag_bindings ALTER COLUMN garment_id DROP NOT NULL;
ALTER TABLE rfid_tag_bindings ADD COLUMN material_lot_id uuid REFERENCES material_lots(id);
ALTER TABLE rfid_tag_bindings ADD COLUMN tag_uid text GENERATED ALWAYS AS
  (upper(regexp_replace(tag_identifier, '[[:space:]:-]', '', 'g'))) STORED;
ALTER TABLE rfid_tag_bindings ADD CONSTRAINT rfid_binding_exactly_one_subject
  CHECK (num_nonnulls(material_lot_id, garment_id) = 1);
ALTER TABLE rfid_tag_bindings ADD CONSTRAINT rfid_binding_valid_uid
  CHECK (tag_uid ~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$');
ALTER TABLE rfid_tag_bindings ADD CONSTRAINT rfid_binding_garment_reference UNIQUE (id, garment_id);
ALTER TABLE rfid_tag_bindings ADD CONSTRAINT rfid_binding_lot_reference UNIQUE (id, material_lot_id);
DROP INDEX garment_tags_active_identifier_uq;
CREATE UNIQUE INDEX rfid_tags_active_uid_uq ON rfid_tag_bindings(tag_uid) WHERE unbound_at IS NULL;
CREATE UNIQUE INDEX rfid_tags_active_lot_uq ON rfid_tag_bindings(material_lot_id)
  WHERE unbound_at IS NULL AND material_lot_id IS NOT NULL;
ALTER INDEX garment_tags_active_garment_uq RENAME TO rfid_tags_active_garment_uq;
COMMENT ON TABLE rfid_tag_bindings IS
  'Demo: one bundle equals one material_lot. One active card per subject. Keep bindings when replacing a card.';

CREATE TABLE device_bridge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  instance_id uuid NOT NULL,
  transport text NOT NULL DEFAULT 'usb_serial' CHECK (transport IN ('usb_serial', 'wifi_https')),
  software_version text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  disconnected_at timestamptz,
  disconnect_reason text,
  UNIQUE (id, device_id),
  CHECK (last_seen_at >= connected_at),
  CHECK (disconnected_at IS NULL OR disconnected_at >= connected_at),
  CHECK (disconnected_at IS NULL OR nullif(btrim(disconnect_reason), '') IS NOT NULL)
);
CREATE UNIQUE INDEX bridge_one_active_device_uq ON device_bridge_sessions(device_id)
  WHERE disconnected_at IS NULL;

ALTER TABLE staff_sessions ADD CONSTRAINT staff_sessions_id_user_uq UNIQUE(id, staff_user_id);
CREATE TABLE reader_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  mapping_version integer NOT NULL,
  reader_index smallint NOT NULL,
  station_code text NOT NULL,
  staff_session_id uuid NOT NULL,
  operator_id uuid NOT NULL REFERENCES staff_users(id),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  close_reason text,
  UNIQUE(id, device_id, mapping_version, reader_index, station_code),
  FOREIGN KEY(device_id, mapping_version, reader_index, station_code)
    REFERENCES device_reader_mappings(device_id, mapping_version, reader_index, station_code),
  FOREIGN KEY(staff_session_id, operator_id) REFERENCES staff_sessions(id, staff_user_id),
  CHECK (expires_at > opened_at),
  CHECK (last_seen_at >= opened_at),
  CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CHECK (closed_at IS NULL OR nullif(btrim(close_reason), '') IS NOT NULL)
);
CREATE UNIQUE INDEX reader_sessions_one_operator_uq ON reader_sessions(device_id, reader_index)
  WHERE closed_at IS NULL;
CREATE INDEX reader_sessions_operator_idx ON reader_sessions(operator_id, expires_at) WHERE closed_at IS NULL;

CREATE TYPE rfid_context_status AS ENUM ('awaiting_ack', 'armed', 'consumed', 'expired', 'cancelled');
CREATE TYPE rfid_scan_outcome AS ENUM ('observed', 'accepted', 'rejected', 'quarantined');

-- A QC result is selected before the shirt identity is known. There is no garment_id here.
CREATE TABLE rfid_action_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  action_code text NOT NULL CHECK (action_code IN (
    'receive_bundle', 'issue_bundle', 'select_cutting_source', 'bind_garment_tag',
    'complete_stitching', 'complete_finishing', 'submit_qc', 'pack_garment',
    'receive_warehouse', 'dispatch_garment'
  )),
  status rfid_context_status NOT NULL DEFAULT 'awaiting_ack',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  source_selection_id uuid,
  cutting_job_id uuid REFERENCES cutting_jobs(id),
  cutting_input_id uuid,
  production_order_id uuid REFERENCES production_orders(id),
  package_id uuid REFERENCES packages(id),
  shipment_id uuid REFERENCES shipments(id),
  warehouse_bin_id uuid REFERENCES warehouse_bins(id),
  quantity numeric(14,3) CHECK(quantity > 0),
  qc_scope inspection_scope,
  qc_outcome inspection_outcome,
  checklist_version_id uuid,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answers) = 'object'),
  notes text,
  defect_reason text,
  UNIQUE(id, reader_session_id),
  FOREIGN KEY(cutting_input_id, cutting_job_id) REFERENCES cutting_inputs(id, cutting_job_id),
  FOREIGN KEY(checklist_version_id, qc_scope) REFERENCES checklist_versions(id, scope) MATCH FULL,
  CHECK (expires_at > created_at),
  CHECK (acknowledged_at IS NULL OR acknowledged_at BETWEEN created_at AND expires_at),
  CHECK (status NOT IN ('armed', 'consumed') OR acknowledged_at IS NOT NULL),
  CHECK ((status IN ('consumed', 'expired', 'cancelled')) = (closed_at IS NOT NULL)),
  CHECK (closed_at IS NULL OR closed_at >= coalesce(acknowledged_at, created_at)),
  CHECK ((action_code = 'submit_qc') = (qc_outcome IS NOT NULL)),
  CHECK (qc_scope IS NULL OR action_code = 'submit_qc'),
  CHECK (qc_scope IS NULL OR qc_scope IN ('final', 'reinspection')),
  CHECK (qc_outcome IS DISTINCT FROM 'fail' OR nullif(btrim(defect_reason), '') IS NOT NULL),
  CHECK (action_code <> 'select_cutting_source' OR cutting_job_id IS NOT NULL),
  CHECK (action_code <> 'bind_garment_tag' OR
    num_nonnulls(source_selection_id, cutting_job_id, cutting_input_id) = 3),
  CHECK (action_code <> 'issue_bundle' OR num_nonnulls(production_order_id, quantity) = 2),
  CHECK (action_code <> 'pack_garment' OR package_id IS NOT NULL),
  CHECK (action_code <> 'receive_warehouse' OR warehouse_bin_id IS NOT NULL),
  CHECK (action_code <> 'dispatch_garment' OR shipment_id IS NOT NULL)
);
CREATE UNIQUE INDEX rfid_context_one_live_per_reader_uq ON rfid_action_contexts(reader_session_id)
  WHERE closed_at IS NULL;

-- Append the final classified scan once. Unknown tags and rejected scans are retained too.
-- event identity and original context stay unchanged during bridge/network retries.
CREATE TABLE rfid_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  bridge_session_id uuid,
  schema_version smallint NOT NULL DEFAULT 1 CHECK(schema_version > 0),
  scan_id text NOT NULL CHECK(length(scan_id) BETWEEN 1 AND 128),
  boot_id text NOT NULL CHECK(length(boot_id) BETWEEN 1 AND 128),
  sequence bigint NOT NULL CHECK(sequence >= 0),
  reader_index smallint NOT NULL CHECK(reader_index BETWEEN 0 AND 255),
  reported_mapping_version integer NOT NULL CHECK(reported_mapping_version > 0),
  tag_uid text NOT NULL CHECK(tag_uid ~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$'),
  reported_context_id uuid,
  reader_session_id uuid,
  resolved_context_id uuid,
  station_code text REFERENCES rfid_stations(code),
  tag_binding_id uuid REFERENCES rfid_tag_bindings(id),
  material_lot_id uuid REFERENCES material_lots(id),
  garment_id uuid REFERENCES garments(id),
  device_uptime_ms bigint CHECK(device_uptime_ms >= 0),
  request_sha256 bytea NOT NULL CHECK(octet_length(request_sha256) = 32),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome rfid_scan_outcome NOT NULL,
  outcome_code text NOT NULL CHECK(outcome_code ~ '^[a-z][a-z0-9_]*$'),
  outcome_message text,
  UNIQUE(device_id, scan_id),
  UNIQUE(device_id, boot_id, sequence),
  UNIQUE(id, garment_id),
  UNIQUE(id, material_lot_id),
  FOREIGN KEY(bridge_session_id, device_id) REFERENCES device_bridge_sessions(id, device_id),
  FOREIGN KEY(reader_session_id, device_id, reported_mapping_version, reader_index, station_code)
    REFERENCES reader_sessions(id, device_id, mapping_version, reader_index, station_code),
  FOREIGN KEY(resolved_context_id, reader_session_id) REFERENCES rfid_action_contexts(id, reader_session_id),
  FOREIGN KEY(tag_binding_id, garment_id) REFERENCES rfid_tag_bindings(id, garment_id),
  FOREIGN KEY(tag_binding_id, material_lot_id) REFERENCES rfid_tag_bindings(id, material_lot_id),
  CHECK(num_nonnulls(material_lot_id, garment_id) <= 1),
  CHECK(resolved_context_id IS NULL OR resolved_context_id IS NOT DISTINCT FROM reported_context_id),
  CHECK(outcome <> 'accepted' OR
    (num_nonnulls(material_lot_id, garment_id) = 1 AND
     num_nonnulls(reader_session_id, station_code, tag_binding_id) = 3)),
  CHECK(outcome NOT IN ('rejected', 'quarantined') OR nullif(btrim(outcome_message), '') IS NOT NULL)
);
CREATE UNIQUE INDEX rfid_context_accepted_once_uq ON rfid_scans(resolved_context_id)
  WHERE outcome = 'accepted' AND resolved_context_id IS NOT NULL;
CREATE INDEX rfid_scans_device_time_idx ON rfid_scans(device_id, received_at DESC);
CREATE INDEX rfid_scans_garment_time_idx ON rfid_scans(garment_id, received_at DESC) WHERE garment_id IS NOT NULL;
CREATE INDEX rfid_scans_lot_time_idx ON rfid_scans(material_lot_id, received_at DESC) WHERE material_lot_id IS NOT NULL;

CREATE TABLE cutting_source_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  cutting_job_id uuid NOT NULL,
  cutting_input_id uuid NOT NULL,
  source_scan_id uuid NOT NULL UNIQUE REFERENCES rfid_scans(id),
  selected_by uuid NOT NULL REFERENCES staff_users(id),
  selected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  close_reason text,
  UNIQUE(id, reader_session_id, cutting_job_id, cutting_input_id),
  FOREIGN KEY(cutting_input_id, cutting_job_id) REFERENCES cutting_inputs(id, cutting_job_id),
  CHECK(closed_at IS NULL OR closed_at >= selected_at),
  CHECK(closed_at IS NULL OR nullif(btrim(close_reason), '') IS NOT NULL)
);
CREATE UNIQUE INDEX cutting_one_source_per_session_uq ON cutting_source_selections(reader_session_id)
  WHERE closed_at IS NULL;
ALTER TABLE rfid_action_contexts ADD CONSTRAINT rfid_context_source_selection_fk
  FOREIGN KEY(source_selection_id, reader_session_id, cutting_job_id, cutting_input_id)
  REFERENCES cutting_source_selections(id, reader_session_id, cutting_job_id, cutting_input_id);

ALTER TABLE inspections ADD COLUMN rfid_scan_id uuid UNIQUE;
ALTER TABLE inspections ADD CONSTRAINT inspection_rfid_garment_fk
  FOREIGN KEY(rfid_scan_id, garment_id) REFERENCES rfid_scans(id, garment_id);
ALTER TABLE inspections ADD CONSTRAINT inspection_rfid_garment_only CHECK(rfid_scan_id IS NULL OR garment_id IS NOT NULL);
CREATE UNIQUE INDEX inspections_one_open_per_garment_uq ON inspections(garment_id)
  WHERE submitted_at IS NULL AND garment_id IS NOT NULL;
CREATE INDEX inspections_latest_qc_idx ON inspections(garment_id, submitted_at DESC)
  WHERE garment_id IS NOT NULL AND submitted_at IS NOT NULL;

ALTER TABLE trace_events ADD COLUMN rfid_scan_id uuid REFERENCES rfid_scans(id);
ALTER TABLE trace_events ADD COLUMN inspection_id uuid REFERENCES inspections(id);
ALTER TABLE trace_events ADD CONSTRAINT trace_event_one_hardware_evidence
  CHECK(num_nonnulls(observation_id, rfid_scan_id) <= 1);
CREATE INDEX trace_events_scan_idx ON trace_events(rfid_scan_id) WHERE rfid_scan_id IS NOT NULL;

-- Legacy commitments remain verifiable. New private commitments must include a secret nonce.
ALTER TABLE ledger_commitments ADD COLUMN hash_scheme text NOT NULL DEFAULT 'sha256';
ALTER TABLE ledger_commitments ADD COLUMN internal_nonce bytea;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'supplyease.ledger_commitments'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%sha256(internal_payload_bytes)%'
  LOOP
    EXECUTE format('ALTER TABLE ledger_commitments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE ledger_commitments ADD CONSTRAINT ledger_commitment_hash_scheme CHECK(
  (public_payload_id IS NOT NULL AND hash_scheme = 'sha256' AND internal_nonce IS NULL)
  OR
  (trace_event_id IS NOT NULL AND octet_length(internal_payload_bytes)>0 AND
    ((hash_scheme = 'sha256' AND internal_nonce IS NULL AND sha256(internal_payload_bytes) = payload_sha256)
     OR (hash_scheme = 'sha256_nonce_v1' AND internal_nonce IS NOT NULL AND octet_length(internal_nonce) = 32
       AND sha256(internal_nonce || internal_payload_bytes) = payload_sha256)))
);
COMMENT ON COLUMN ledger_commitments.internal_nonce IS
  'Private 32-byte unpredictable nonce. Never publish this, internal payload bytes, QC outcome, or garment mapping on-chain.';

CREATE FUNCTION protect_new_private_commitment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NEW.trace_event_id IS NOT NULL AND
     (NEW.hash_scheme <> 'sha256_nonce_v1' OR NEW.internal_nonce IS NULL) THEN
    RAISE EXCEPTION 'new internal commitments require sha256_nonce_v1 and a private 32-byte nonce' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_commitments_require_private_nonce BEFORE INSERT ON ledger_commitments
  FOR EACH ROW EXECUTE FUNCTION protect_new_private_commitment();

CREATE FUNCTION protect_rfid_binding_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'tag assignments cannot be deleted' USING ERRCODE='55000'; END IF;
  IF OLD.unbound_at IS NOT NULL OR
     ROW(NEW.id, NEW.garment_id, NEW.material_lot_id, NEW.tag_identifier, NEW.tag_technology, NEW.bound_by, NEW.bound_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.garment_id, OLD.material_lot_id, OLD.tag_identifier, OLD.tag_technology, OLD.bound_by, OLD.bound_at) THEN
    RAISE EXCEPTION 'unbind the old tag and append a new assignment; do not rewrite tag history' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rfid_binding_history BEFORE UPDATE OR DELETE ON rfid_tag_bindings
  FOR EACH ROW EXECUTE FUNCTION protect_rfid_binding_history();

CREATE FUNCTION staff_has_station_access(p_staff uuid, p_station text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, supplyease AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_users u
    JOIN staff_role_grants g ON g.staff_user_id = u.id AND g.revoked_at IS NULL
    JOIN rfid_stations s ON s.code = p_station
    JOIN checkpoints c ON c.code = s.checkpoint_code
    WHERE u.id = p_staff AND u.activated_at IS NOT NULL AND u.suspended_at IS NULL
      AND g.department_code = c.department_code
      AND g.role = CASE
        WHEN s.code IN ('fabric_receiving','fabric_issue') THEN 'materials'::staff_role
        WHEN s.code = 'final_qc' THEN 'quality'::staff_role
        WHEN s.code IN ('packing','warehouse','dispatch') THEN 'logistics'::staff_role
        ELSE 'production'::staff_role END
  );
$$;

CREATE FUNCTION validate_reader_session() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.id,NEW.device_id,NEW.mapping_version,NEW.reader_index,NEW.station_code,
      NEW.staff_session_id,NEW.operator_id,NEW.opened_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.device_id,OLD.mapping_version,OLD.reader_index,OLD.station_code,
      OLD.staff_session_id,OLD.operator_id,OLD.opened_at,OLD.expires_at) THEN
    RAISE EXCEPTION 'reader ownership is immutable; close and open a new session' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'closed reader sessions cannot be changed' USING ERRCODE='55000';
  END IF;
  IF NEW.closed_at IS NULL AND (
    NOT staff_has_station_access(NEW.operator_id, NEW.station_code)
    OR NOT EXISTS (SELECT 1 FROM staff_sessions s WHERE s.id=NEW.staff_session_id
      AND s.staff_user_id=NEW.operator_id AND s.revoked_at IS NULL AND s.expires_at >= NEW.expires_at)
    OR NOT EXISTS (SELECT 1 FROM devices d JOIN device_mapping_versions m ON m.device_id=d.id
      WHERE d.id=NEW.device_id AND d.enabled AND m.version=NEW.mapping_version
        AND m.activated_at IS NOT NULL AND m.retired_at IS NULL)
  ) THEN RAISE EXCEPTION 'reader session requires authorized staff, a valid login, and an active verified mapping' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reader_sessions_validate BEFORE INSERT OR UPDATE ON reader_sessions
  FOR EACH ROW EXECUTE FUNCTION validate_reader_session();

CREATE FUNCTION validate_rfid_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE rs reader_sessions; required_station text;
BEGIN
  SELECT * INTO rs FROM reader_sessions WHERE id=NEW.reader_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown reader session' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.closed_at IS NOT NULL OR
      (to_jsonb(NEW) - ARRAY['status','acknowledged_at','closed_at','close_reason'])
        IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status','acknowledged_at','closed_at','close_reason']) THEN
      RAISE EXCEPTION 'context payload is immutable; cancel it and issue a new context' USING ERRCODE='55000';
    END IF;
    IF NOT ((OLD.status='awaiting_ack' AND NEW.status IN ('armed','cancelled','expired')) OR
            (OLD.status='armed' AND NEW.status IN ('consumed','cancelled','expired'))) THEN
      RAISE EXCEPTION 'invalid RFID context transition' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.status <> 'awaiting_ack' THEN
    RAISE EXCEPTION 'a new context must await board acknowledgement' USING ERRCODE='23514';
  END IF;
  required_station := CASE NEW.action_code
    WHEN 'receive_bundle' THEN 'fabric_receiving' WHEN 'issue_bundle' THEN 'fabric_issue'
    WHEN 'select_cutting_source' THEN 'cutting' WHEN 'bind_garment_tag' THEN 'cutting'
    WHEN 'complete_stitching' THEN 'stitching' WHEN 'complete_finishing' THEN 'finishing'
    WHEN 'submit_qc' THEN 'final_qc' WHEN 'pack_garment' THEN 'packing'
    WHEN 'receive_warehouse' THEN 'warehouse' WHEN 'dispatch_garment' THEN 'dispatch' END;
  IF rs.station_code IS DISTINCT FROM required_station OR NEW.expires_at > rs.expires_at THEN
    RAISE EXCEPTION 'context station or expiry does not match its reader session' USING ERRCODE='23514';
  END IF;
  IF NEW.status IN ('awaiting_ack','armed') AND
    (rs.closed_at IS NOT NULL OR rs.expires_at <= clock_timestamp() OR
     NOT staff_has_station_access(rs.operator_id,rs.station_code)) THEN
    RAISE EXCEPTION 'reader session is not active or authorized' USING ERRCODE='23514';
  END IF;
  IF NEW.status='consumed' AND NOT EXISTS (
    SELECT 1 FROM rfid_scans WHERE resolved_context_id=NEW.id AND outcome='accepted'
  ) THEN RAISE EXCEPTION 'consume a context only after recording its accepted scan' USING ERRCODE='23514'; END IF;
  IF NEW.action_code='bind_garment_tag' AND NEW.status IN ('awaiting_ack','armed') AND NOT EXISTS (
    SELECT 1 FROM cutting_source_selections WHERE id=NEW.source_selection_id AND closed_at IS NULL
      AND reader_session_id=NEW.reader_session_id AND cutting_job_id=NEW.cutting_job_id
      AND cutting_input_id=NEW.cutting_input_id
  ) THEN RAISE EXCEPTION 'select and confirm an active fabric source before assigning a shirt card' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rfid_context_validate BEFORE INSERT OR UPDATE ON rfid_action_contexts
  FOR EACH ROW EXECUTE FUNCTION validate_rfid_context();

CREATE FUNCTION validate_accepted_rfid_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE rs reader_sessions; ctx rfid_action_contexts; station rfid_stations;
        current_stage garment_stage;
BEGIN
  IF NEW.outcome <> 'accepted' THEN RETURN NEW; END IF;
  SELECT * INTO rs FROM reader_sessions WHERE id=NEW.reader_session_id FOR UPDATE;
  IF rs.closed_at IS NOT NULL OR rs.expires_at <= clock_timestamp()
     OR NEW.received_at < rs.opened_at OR NEW.received_at >= rs.expires_at
     OR NOT staff_has_station_access(rs.operator_id,rs.station_code)
     OR NOT EXISTS (SELECT 1 FROM staff_sessions s WHERE s.id=rs.staff_session_id
       AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp())
     OR NOT EXISTS (SELECT 1 FROM devices d JOIN device_mapping_versions m ON m.device_id=d.id
       WHERE d.id=NEW.device_id AND d.enabled AND m.version=NEW.reported_mapping_version
         AND m.activated_at IS NOT NULL AND m.retired_at IS NULL) THEN
    RAISE EXCEPTION 'scan requires a currently authorized reader session and mapping' USING ERRCODE='23514';
  END IF;
  SELECT * INTO station FROM rfid_stations WHERE code=NEW.station_code;
  IF station.requires_explicit_context AND NEW.resolved_context_id IS NULL THEN
    RAISE EXCEPTION 'select and arm a dashboard action before scanning this station' USING ERRCODE='23514';
  END IF;
  IF NEW.resolved_context_id IS NOT NULL THEN
    SELECT * INTO ctx FROM rfid_action_contexts WHERE id=NEW.resolved_context_id FOR UPDATE;
    IF ctx.status <> 'armed' OR ctx.reader_session_id <> NEW.reader_session_id
       OR NEW.received_at < ctx.acknowledged_at OR NEW.received_at >= ctx.expires_at
       OR ctx.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'scan context is stale, unacknowledged, or already consumed' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rfid_tag_bindings b WHERE b.id=NEW.tag_binding_id
    AND b.tag_uid=NEW.tag_uid AND b.unbound_at IS NULL
    AND b.bound_at<=NEW.received_at
    AND ROW(b.garment_id,b.material_lot_id) IS NOT DISTINCT FROM ROW(NEW.garment_id,NEW.material_lot_id)) THEN
    RAISE EXCEPTION 'scan UID and resolved subject must match the active tag binding' USING ERRCODE='23514';
  END IF;
  IF (station.subject_kind='material_lot' AND NEW.material_lot_id IS NULL)
     OR (station.subject_kind='garment' AND NEW.garment_id IS NULL)
     OR (ctx.action_code='select_cutting_source' AND NEW.material_lot_id IS NULL)
     OR (ctx.action_code='bind_garment_tag' AND NEW.garment_id IS NULL) THEN
    RAISE EXCEPTION 'wrong type of card for this station action' USING ERRCODE='23514';
  END IF;
  IF ctx.action_code='bind_garment_tag' AND NOT EXISTS (
    SELECT 1 FROM garment_material_inputs gmi JOIN cutting_source_selections sel
      ON sel.id=ctx.source_selection_id AND sel.closed_at IS NULL
    WHERE gmi.garment_id=NEW.garment_id AND gmi.cutting_job_id=sel.cutting_job_id
      AND gmi.cutting_input_id=sel.cutting_input_id
  ) THEN RAISE EXCEPTION 'new shirt must link to the confirmed cutting source in the same transaction' USING ERRCODE='23514'; END IF;
  IF NEW.garment_id IS NOT NULL THEN
    SELECT stage INTO current_stage FROM garments WHERE id=NEW.garment_id FOR NO KEY UPDATE;
    IF (station.code='stitching' AND current_stage <> 'cut')
      OR (station.code='finishing' AND current_stage <> 'stitched')
      OR (station.code='final_qc' AND current_stage NOT IN ('finished','returned'))
      OR (station.code='packing' AND current_stage <> 'finished')
      OR (station.code='warehouse' AND current_stage <> 'packed')
      OR (station.code='dispatch' AND current_stage <> 'warehoused') THEN
      RAISE EXCEPTION 'shirt is not at the expected workflow stage for this reader' USING ERRCODE='23514';
    END IF;
    IF station.code IN ('packing','warehouse','dispatch') AND
       NOT garment_quality_allows_fulfilment(NEW.garment_id) THEN
      RAISE EXCEPTION 'scan operation blocked: QC is missing, failed, pending or held' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rfid_scan_validate BEFORE INSERT ON rfid_scans
  FOR EACH ROW EXECUTE FUNCTION validate_accepted_rfid_scan();
CREATE TRIGGER rfid_scan_history BEFORE UPDATE OR DELETE ON rfid_scans
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();

CREATE FUNCTION validate_cutting_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF TG_OP='UPDATE' AND (OLD.closed_at IS NOT NULL OR
    (to_jsonb(NEW)-ARRAY['closed_at','close_reason']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['closed_at','close_reason'])) THEN
    RAISE EXCEPTION 'cutting source history is immutable; close and create a new selection' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM rfid_scans s JOIN cutting_inputs ci ON ci.id=NEW.cutting_input_id
    JOIN rfid_action_contexts c ON c.id=s.resolved_context_id
    JOIN reader_sessions rs ON rs.id=NEW.reader_session_id
    WHERE s.id=NEW.source_scan_id AND s.outcome='accepted' AND s.station_code='cutting'
      AND s.reader_session_id=NEW.reader_session_id AND ci.cutting_job_id=NEW.cutting_job_id
      AND s.material_lot_id=ci.material_lot_id AND c.action_code='select_cutting_source'
      AND c.cutting_job_id=NEW.cutting_job_id AND rs.operator_id=NEW.selected_by
  ) THEN RAISE EXCEPTION 'source selection must match its bundle scan, issued input, cutting job and operator' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cutting_source_validate BEFORE INSERT OR UPDATE ON cutting_source_selections
  FOR EACH ROW EXECUTE FUNCTION validate_cutting_source();

CREATE FUNCTION validate_rfid_inspection() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NEW.rfid_scan_id IS NOT NULL AND NEW.submitted_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rfid_scans s JOIN rfid_action_contexts c ON c.id=s.resolved_context_id
    JOIN reader_sessions rs ON rs.id=s.reader_session_id
    WHERE s.id=NEW.rfid_scan_id AND s.outcome='accepted' AND s.station_code='final_qc'
      AND s.garment_id=NEW.garment_id AND c.action_code='submit_qc'
      AND c.qc_outcome=NEW.outcome AND (c.qc_scope IS NULL OR c.qc_scope=NEW.scope)
      AND (c.checklist_version_id IS NULL OR c.checklist_version_id=NEW.checklist_version_id) AND c.answers=NEW.answers
      AND c.defect_reason IS NOT DISTINCT FROM NEW.defect_reason
      AND rs.operator_id=NEW.inspector_id AND NEW.submitted_at>=s.received_at
  ) THEN RAISE EXCEPTION 'inspection must use the decision and shirt identified by its QA scan' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inspections_validate_rfid BEFORE INSERT OR UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION validate_rfid_inspection();

-- A released projection alone is insufficient: require actual current passing evidence.
CREATE FUNCTION garment_quality_allows_fulfilment(p_garment uuid) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path = pg_catalog, supplyease AS $$
  SELECT EXISTS (
    SELECT 1 FROM garments g WHERE g.id=p_garment AND g.quality_disposition='released'
      AND g.stage NOT IN ('returned','scrapped')
      AND NOT EXISTS (SELECT 1 FROM garment_holds h WHERE h.garment_id=g.id AND h.released_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM inspections i WHERE i.garment_id=g.id AND i.submitted_at IS NULL)
      AND EXISTS (
        SELECT 1 FROM inspections good WHERE good.garment_id=g.id AND good.outcome='pass'
          AND good.submitted_at IS NOT NULL AND good.scope IN ('final','reinspection')
          AND NOT EXISTS (SELECT 1 FROM inspections bad WHERE bad.garment_id=g.id
            AND bad.outcome='fail' AND bad.submitted_at>=good.submitted_at)
      )
  );
$$;

CREATE OR REPLACE FUNCTION check_package_item_eligibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE pkg package_status; garment_current_stage garment_stage;
BEGIN
  SELECT status INTO pkg FROM packages WHERE id=NEW.package_id FOR NO KEY UPDATE;
  SELECT stage INTO garment_current_stage FROM garments WHERE id=NEW.garment_id FOR NO KEY UPDATE;
  IF pkg IS DISTINCT FROM 'open' OR garment_current_stage IS DISTINCT FROM 'finished'
     OR NOT garment_quality_allows_fulfilment(NEW.garment_id) THEN
    RAISE EXCEPTION 'packing requires an open package, finished garment, valid QC pass and no pending inspection or hold' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION lock_inspection_subject() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NEW.garment_id IS NOT NULL THEN
    PERFORM 1 FROM garments WHERE id=NEW.garment_id FOR NO KEY UPDATE;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inspections_lock_subject BEFORE INSERT OR UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION lock_inspection_subject();

CREATE FUNCTION guard_garment_fulfilment_stage() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NEW.stage IN ('packed','warehoused','dispatched') AND NEW.stage IS DISTINCT FROM OLD.stage
    AND (NEW.quality_disposition <> 'released' OR NOT garment_quality_allows_fulfilment(OLD.id)) THEN
    RAISE EXCEPTION 'quality gate blocks fulfilment until valid inspection and release' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER garments_guard_fulfilment BEFORE UPDATE OF stage ON garments
  FOR EACH ROW EXECUTE FUNCTION guard_garment_fulfilment_stage();

CREATE FUNCTION guard_new_garment_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,supplyease AS $$ BEGIN
  IF NEW.stage <> 'cut' OR NEW.quality_disposition <> 'awaiting_inspection' THEN
    RAISE EXCEPTION 'new shirts start at cutting and await quality inspection' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER garments_guard_initial_state BEFORE INSERT ON garments
  FOR EACH ROW EXECUTE FUNCTION guard_new_garment_state();

CREATE FUNCTION guard_dispatch_quality() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE gid uuid;
BEGIN
  IF NEW.departed_at IS NOT NULL AND OLD.departed_at IS NULL THEN
    FOR gid IN SELECT DISTINCT pi.garment_id FROM shipment_packages sp
      JOIN package_items pi ON pi.package_id=sp.package_id AND pi.removed_at IS NULL
      WHERE sp.shipment_id=NEW.id AND sp.deallocated_at IS NULL ORDER BY pi.garment_id
    LOOP
      PERFORM 1 FROM garments WHERE id=gid FOR NO KEY UPDATE;
      IF NOT garment_quality_allows_fulfilment(gid) THEN
        RAISE EXCEPTION 'dispatch blocked by missing, failed, pending or held QC' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipments_guard_current_qc BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION guard_dispatch_quality();

CREATE FUNCTION protect_package_membership() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE pkg package_status;
BEGIN
  SELECT status INTO pkg FROM packages WHERE id=OLD.package_id FOR NO KEY UPDATE;
  PERFORM 1 FROM garments WHERE id=OLD.garment_id FOR NO KEY UPDATE;
  IF OLD.removed_at IS NOT NULL OR pkg <> 'open' OR
    (to_jsonb(NEW)-ARRAY['removed_by','removed_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['removed_by','removed_at']) THEN
    RAISE EXCEPTION 'only removal from an open package is permitted; membership history is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER package_membership_history BEFORE UPDATE ON package_items
  FOR EACH ROW EXECUTE FUNCTION protect_package_membership();

-- New garments must acquire source lineage before their creation transaction commits.
CREATE FUNCTION require_garment_lineage() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM garment_material_inputs WHERE garment_id=NEW.id) THEN
    RAISE EXCEPTION 'every shirt needs at least one actual cutting material input before commit' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER garments_require_lineage AFTER INSERT ON garments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_garment_lineage();

CREATE FUNCTION validate_trace_scan_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NEW.rfid_scan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rfid_scans s JOIN reader_sessions rs ON rs.id=s.reader_session_id
    WHERE s.id=NEW.rfid_scan_id AND s.outcome='accepted' AND rs.operator_id=NEW.actor_id
      AND (s.garment_id=NEW.garment_id OR s.material_lot_id=NEW.material_lot_id
           OR NEW.package_id IS NOT NULL OR NEW.shipment_id IS NOT NULL)
  ) THEN RAISE EXCEPTION 'trace event must use accepted scan evidence and its recorded operator/subject' USING ERRCODE='23514'; END IF;
  IF NEW.inspection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inspections i WHERE i.id=NEW.inspection_id AND i.submitted_at IS NOT NULL
      AND i.inspector_id=NEW.actor_id
      AND (i.garment_id=NEW.garment_id OR i.material_lot_id=NEW.material_lot_id)
      AND (NEW.rfid_scan_id IS NULL OR i.rfid_scan_id=NEW.rfid_scan_id)
  ) THEN RAISE EXCEPTION 'trace inspection evidence must match its submitted subject, inspector and scan' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trace_events_validate_scan BEFORE INSERT ON trace_events
  FOR EACH ROW EXECUTE FUNCTION validate_trace_scan_evidence();

CREATE FUNCTION check_completed_scan_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE c rfid_action_contexts;
BEGIN
  IF NEW.outcome='accepted' AND NEW.resolved_context_id IS NOT NULL THEN
    SELECT * INTO c FROM rfid_action_contexts WHERE id=NEW.resolved_context_id;
    IF c.status <> 'consumed' OR c.closed_at<NEW.received_at THEN
      RAISE EXCEPTION 'consume the one-use context in the same transaction as its accepted scan' USING ERRCODE='23514';
    END IF;
    IF c.action_code='submit_qc' AND NOT EXISTS (
      SELECT 1 FROM inspections i JOIN trace_events e ON e.inspection_id=i.id
      WHERE i.rfid_scan_id=NEW.id AND i.submitted_at IS NOT NULL
        AND e.rfid_scan_id=NEW.id AND i.outcome=c.qc_outcome
    ) THEN RAISE EXCEPTION 'QA scan, submitted inspection and internal trace event must commit together' USING ERRCODE='23514'; END IF;
    IF c.action_code='select_cutting_source' AND NOT EXISTS (
      SELECT 1 FROM cutting_source_selections WHERE source_scan_id=NEW.id
    ) THEN RAISE EXCEPTION 'bundle scan must save its explicit cutting-source selection' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER rfid_scan_complete_context AFTER INSERT ON rfid_scans
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_completed_scan_context();

-- A failed QA result must create durable hold/rework evidence before commit.
-- A later reinspection failure can remain under its existing open quality hold.
CREATE FUNCTION require_failed_inspection_hold() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$ BEGIN
  IF NEW.garment_id IS NOT NULL AND NEW.outcome='fail' AND NEW.submitted_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM garment_holds h JOIN rework_cases r ON r.hold_id=h.id
      WHERE h.garment_id=NEW.garment_id AND h.kind='quality'
        AND (h.origin_inspection_id=NEW.id OR
          (NEW.scope='reinspection' AND h.released_at IS NULL))
    ) THEN RAISE EXCEPTION 'failed garment inspection requires a quality hold and rework case in the same transaction' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inspection_failure_requires_hold AFTER INSERT OR UPDATE ON inspections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_failed_inspection_hold();

-- The public endpoint reads an allowlisted payload and this CURRENT status. It must
-- never serve internal tables or show an older released payload as current clearance.
CREATE VIEW public_garment_release_status AS
SELECT g.public_id,
  CASE WHEN EXISTS(SELECT 1 FROM garment_holds h WHERE h.garment_id=g.id
    AND h.kind='recall' AND h.released_at IS NULL) THEN 'recalled'
    WHEN g.stage='scrapped' OR g.quality_disposition='scrapped' THEN 'unavailable'
    WHEN garment_quality_allows_fulfilment(g.id) THEN 'released'
    ELSE 'not_released' END AS release_status
FROM garments g;

CREATE FUNCTION check_garment_attributed_quantity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, supplyease AS $$
DECLARE allowed numeric; already_used numeric;
BEGIN
  SELECT consumed_quantity INTO allowed FROM cutting_inputs WHERE id=NEW.cutting_input_id FOR NO KEY UPDATE;
  SELECT coalesce(sum(attributed_quantity),0) INTO already_used FROM garment_material_inputs
    WHERE cutting_input_id=NEW.cutting_input_id;
  IF NEW.attributed_quantity IS NOT NULL AND already_used+NEW.attributed_quantity>allowed THEN
    RAISE EXCEPTION 'garment attribution exceeds the actual cutting consumption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER garment_material_quantity_check BEFORE INSERT ON garment_material_inputs
  FOR EACH ROW EXECUTE FUNCTION check_garment_attributed_quantity();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['reader_sessions','rfid_action_contexts','cutting_source_selections','package_items','shipment_packages'] LOOP
    EXECUTE format('CREATE TRIGGER prevent_history_delete BEFORE DELETE ON supplyease.%I FOR EACH ROW EXECUTE FUNCTION supplyease.forbid_history_change()',t);
  END LOOP;
END $$;
CREATE TRIGGER reader_mapping_history BEFORE UPDATE OR DELETE ON device_reader_mappings
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();

-- Backend/worker only. No raw operational tables, internal payloads, credentials or
-- failure details are exposed to browser roles or the public Supabase Data API.
REVOKE ALL ON SCHEMA supplyease FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA supplyease FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA supplyease FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA supplyease FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA supplyease REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA supplyease FROM %I',r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA supplyease FROM %I',r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA supplyease FROM %I',r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA supplyease FROM %I',r);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations(version,description) VALUES
  ('20261118_weartrail_rfid_v1','Bundle and shirt RFID bindings, nine stations, USB bridge sessions, scan-confirmed QC and fulfilment gates');

COMMIT;
