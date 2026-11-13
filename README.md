# WearTrail

**Follow the journey behind what you wear.**

WearTrail traces individual garments through factory operations and gives shoppers a public product journey.
This repository is the **frontend scaffold** built on the Lovable TanStack Start starter: 26 routes, a shared staff
workspace, two anonymous product pages and a connected mock demo. All data is synthetic.

## Commands

```bash
bun install        # install dependencies
bun run dev        # dev server on http://localhost:8080
bun run build      # production build
bun run test       # vitest (access rules + SHIRT-002 end-to-end path)
bun run lint
```

## Demo accounts

Open `/staff/login` and pick an identity from **Demo accounts** (no password). **Reset demo** on the same screen restores the seed.

| Username | Role | Department / scope |
| --- | --- | --- |
| admin.demo | A — Administrator | Technical administration |
| manager.demo | M — Supply-chain manager | Factory planning and supervision |
| receiving.demo | O — Materials | Receiving |
| rawstore.demo | O — Materials | Raw material issue |
| cutting.demo | P — Production | Cutting |
| stitching.demo | P — Production | Stitching |
| finishing.demo | P — Production | Finishing |
| quality.demo | Q — Quality inspector | Incoming, final and reinspection |
| packing.demo | L — Logistics | Packing |
| warehouse.demo | L — Logistics | Finished-goods warehouse |
| dispatch.demo | L — Logistics | Dispatch |

Sample credential links: `/staff/credentials/demo-valid-token`, `demo-expired-token`, `demo-used-token`.

## Sample product URLs

- `/p/shirt-001-demo` — completed example (dispatched, sample-confirmed evidence, advisory notice)
- `/p/shirt-002-demo` — awaiting final QC; changes as you run the demo
- Add `/proof` for the verification page.

## Demo script (SHIRT-002)

1. **quality.demo** → Workstation: select T-101, arm, *Simulate S4* (presence only). Quality → INSP-002 → **Submit Fail** with a defect reason. Garment goes on hold; RW case opens.
2. **manager.demo** → Rework → assign to Stitching. Shipments → SHP-002 → Edit plan → mark planned (held garment stays blocked).
3. **stitching.demo** → Rework → Record repair completion (opens a fresh reinspection; cannot release the hold).
4. **quality.demo** → reinspection → **Submit Pass** → **Release hold**.
5. **packing.demo** → Fulfilment → Add to package. **warehouse.demo** → Receive into stock → Allocate to SHP-002.
6. **dispatch.demo** → Workstation: select T-106, arm, *Simulate S6*. Shipments → SHP-002 → **Confirm departure**.
7. Open `/p/shirt-002-demo` — journey shows *Passed quality control* and *Dispatched to authorized retail network*.

## Feature folders

```
src/
  app/            routing & auth adapters (AppLink, useAppNavigate, session, guard, shell, paths)
  routes/         thin TanStack route wrappers — one per URL, no logic
  features/       portable views by feature: auth, dashboard, tasks, workstation, materials,
                  production, garments, quality, rework, fulfilment, shipments, ledger, audit,
                  reports, admin, public
  components/ui/  starter primitives (shadcn/Radix)
  components/wt/  shared WearTrail UI: Logo, StatusBadge, DataTable, states, PageHeader, dialogs
  domain/         types, public projection types, labels, permission rules
  lib/data/       WearTrailClient interface, DataProvider, query/action hooks
  mock/           fixtures, store (localStorage), workflow engine, public projection, mock client
```

## Connecting Express

All data goes through `WearTrailClient` (`src/lib/data/client.ts`); each method documents its suggested endpoint.
To switch: implement the interface with `fetch()` calls to Express (PostgreSQL on Supabase behind it) and pass it to
`<DataProvider client={...}>` in `src/routes/__root.tsx` (or change the default in `src/lib/data/provider.tsx`).
Replace `src/app/session.ts` with the real session flow. The server must enforce the rules in
`src/mock/engine.ts` and `src/domain/permissions.ts` itself and derive the actor from its own session.

## Moving to React Router + Vite

Views import only `src/app/navigation.tsx` (AppLink / useAppNavigate / usePathname) and `src/app/paths.ts`.
Re-implement those with react-router, then map each file in `src/routes/` to a route element. The guard lives in
`src/app/StaffWorkspace.tsx`; route access keys are in each route's `staticData.access`.

## Known mock limits

- Access control, sign-in and route guards are **UI simulation only**. No real credentials are collected or stored.
- Demo state lives in one browser's localStorage; other browsers/devices see their own copy.
- Staff and public pages render client-side (`ssr: false`) because the mock state is in the browser.
- Ledger commitments, digests and proof references are samples; there is no blockchain or explorer.
- The ESP32 sensors are simulated with buttons. Raw issue and warehouse steps are software-only.
- New garments created from cutting have no published public record.

## Suggested branch boundaries (Antigravity handoff)

1. `feature/staff-foundation` — screens 01–04 and 23–24, shell, staff session, navigation and shared styles.
2. `feature/materials-production` — screens 05–12, lots, lineage, task queue and workstation.
3. `feature/quality-fulfilment` — screens 13–19, inspections, rework, packing, stock and dispatch.
4. `feature/ledger-public` — screens 20–22 and 25–26, ledger, audit, reports and public pages.
