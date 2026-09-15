# Project status

## Drivers calendar colors — 2026-09-11

Implemented in `src/components/DriversCalendar.tsx`: Roger blue, Pitsch green, Csaba purple, Spas orange. Custom names receive deterministic colors. Single-driver days use solid fills; two-driver days split diagonally at 50%; additional drivers use diagonal bands. The legend and assignment menu use matching color dots. Names remain visible, and today retains a distinct outline. Day grouping includes primary and secondary driver fields and deduplicates names case-insensitively. Assignment write behavior is unchanged.

Validation: TypeScript project check and Vite production build passed. No deployment performed.

## Local preview — 2026-09-11

Vite is running at http://localhost:5173 in the agent's VPS browser container (`relay-agent-cmp_cf56f6ad-2954-47ca-b184-d59d4b724c78`), using the shared canonical `/workspace/projects/twinfinal` checkout. HTTP 200 confirmed and opened in the visible browser. Server log: `/tmp/twinfinal-vite.log` inside that container. The worker-container server was stopped because the browser uses a separate Docker network.

Browser verification: http://127.0.0.1:5173/drivers loads successfully and redirects to the login screen. Use 127.0.0.1 for this preview; the localhost origin showed stale code with missing Firebase config, whereas the running server has all required configuration.

## Localhost skeleton fix — 2026-09-11

Root cause: the service worker treated Vite source modules as cache-first assets, retaining old transformed Firebase configuration and Vite client code. Updated `public/sw.js` to bypass caching for `/src/`, `/node_modules/`, and `/@` development requests. Updated the active localhost service worker through the visible browser and confirmed http://localhost:5173/login renders with Firebase auth initialized and no console errors. JavaScript syntax and diff whitespace checks passed. This supersedes the earlier 127.0.0.1 workaround. No deployment performed.

## Firebase deployment — 2026-09-11

Deployed the driver colors and development cache fix to Firebase Hosting site `twinparagliding` in project `twinscheduler`: https://twinparagliding.web.app. TypeScript, main app, booking embed, and voucher embed builds passed. Firebase CLI confirmed release complete. Live main HTML, service worker, and both embed HTML files returned HTTP 200 and matched the new build exactly. Hosting-only deployment; database rules and functions were not deployed. Used the Linux-compatible equivalent of the existing build pipeline because its `sed -i ''` command targets macOS.

## Past booking dates and times — 2026-09-12

The shared BookingRequestForm (main, custom, and embedded forms) now initializes and validates dates in Europe/Zurich, disables past calendar days and elapsed displayed departure slots, expires selected slots as time passes, and rechecks immediately before submission. Capacity restriction overrides do not bypass this check. The UI labels departure times as Swiss time. Validation uses the browser clock with the Swiss timezone; this is form validation, not a new server-side write restriction.

Validation: TypeScript and all three production builds passed. Five regression tests passed under both America/Los_Angeles and Asia/Tokyo, covering summer/winter offsets, Swiss midnight, DST transitions, and the exact departure boundary. Deployed Hosting to twinscheduler / twinparagliding; verified live main and embedded HTML match the build and their bundles contain the Swiss validation. Database rules/functions unchanged.

## Request pickup preservation — 2026-09-15

User approved the reviewed minimal fix for inbox and waiting-list requests. `src/components/ScheduleGrid.tsx` now passes request `meetingPoint` as `initialData.pickupLocation`; `src/components/NewBookingModal.tsx` accepts and initializes that value. Both request statuses share Book for Another Time. Existing editable pickup field, empty-value save behavior, and fresh-form blank reset remain in place. Ordinary waitlist Book already maps meetingPoint and needed no change.

Validation: `npx tsc -b`, main Vite production build (output `/tmp/twinfinal-pickup-review-build`), and `git diff --check` passed. Reviewed the shared request flow and submit mapping. Browser save/reopen verification was not performed. No deployment. Existing unrelated worktree changes preserved.

## Pickup fix deployment and autonomy preference — 2026-09-15

Deployed the pickup preservation fix to Firebase Hosting project `twinscheduler`, site `twinparagliding`, https://twinparagliding.web.app. TypeScript and all three Vite builds passed. Built into `/tmp/twinfinal-pickup-release-20260915` to preserve existing generated files. Firebase CLI confirmed release complete. Live index, service worker, both embed HTML files, and main JavaScript bundle returned HTTP 200 and matched the release files byte for byte. Verified request pickup mapping and initialization are present in that bundle. Browser booking save/reopen was not tested. Hosting-only release.

User explicitly requested more initiative: approved fixes should proceed through verification, established deployment, and live checks without a separate deployment prompt. Saved this preference in `/workspace/agents/agt_8c41da30-7d7b-4c2b-866c-bdb53ccb50bf/AGENTS.md`.
