
## What I'm building

A Timetable Management System matching your uploaded HTML design (Poppins, indigo `#4b49ac` / `#0c007d` palette, fixed header + collapsible sidebar, light-blue background `#cad7fda4`), powered by Lovable Cloud for persistent real data.

## Pages

1. **`/auth`** — sign in / sign up (email + password).
2. **`/`** — Dashboard: counts of students, lecturers, rooms, subjects, registrations + quick links.
3. **`/add`** — Add data: tabs for Students, Lecturers, Rooms, Subjects, Registrations (matching `addingDatasForTimetable.html`).
4. **`/view`** — View / edit / delete records, with search + entity tabs (matching `viewDataForTimetable.html`).
5. **`/generate`** — Run the timetable generator, see status, and view the resulting grid (matching `generate.html`).
6. **`/timetable`** — Browse generated timetable filtered by student / lecturer / room, with print/PDF export.

## Data model (Lovable Cloud / Postgres)

- `profiles(id, email, full_name, role)` + `user_roles(user_id, role)` (`admin`, `lecturer`, `student`) using the standard secure roles pattern (separate table + `has_role()` SECURITY DEFINER).
- `students(id, student_no, name, year, email)`
- `lecturers(id, lecturer_no, name, email)`
- `rooms(id, name, capacity)`
- `subjects(id, code, name, lecturer_id, duration_hours [1 or 2], year)`
- `registrations(id, student_id, subject_id, is_retake)` — drives "schedule by actual registrations".
- `timetable_entries(id, subject_id, room_id, day, start_slot, end_slot)` — the generated schedule.

RLS: admins write everything; lecturers and students read everything but only see "their" timetable in the filtered view.

## Timetable generator (server function)

Implemented in TypeScript on the server, using:

1. **Greedy ordering** — sort subjects by enrolled-student count (largest first).
2. **CSP backtracking** — assign each subject a `(day, startSlot, room)` triple, respecting:
   - 6 timeslots/day × 5 days (lunch 12–1 is skipped).
   - 2-hour subjects require two *consecutive* morning (9–11, 10–12) or afternoon (1–3, 2–4) slots — never crossing lunch.
   - No conflict for any enrolled student (handles cross-year + retakes).
   - No lecturer conflict.
   - No room conflict.
   - Room capacity ≥ enrolled count.
3. **Graph-coloring fallback** — when backtracking fails on a subject, build a conflict graph (subjects sharing students/lecturer) and reassign using a Welsh–Powell-style recolor pass before giving up.

Returns either a complete schedule or a list of unschedulable subjects with the reason (which constraint failed).

## Design system

- Add Poppins via `<link>` in `__root.tsx`.
- Tokens in `src/styles.css` matching your palette (`--primary: #4b49ac`, `--secondary: #0c007d`, `--bg: #cad7fda4`, surface `#fafaff`, accent `#5500cb`).
- Shared `AppShell` with fixed header (logo, search, profile) + collapsible sidebar (Dashboard, Add Data, View Data, Generate, Timetable, Logout) — same look as the uploaded HTML, ported to React + shadcn.

## Out of scope (this pass)

- Bulk CSV import (we'll add forms only; can add CSV later).
- Multi-semester / multi-section management.
- Lecturer availability preferences (assumed always available across the 5 days).

Ready to build — shall I proceed?
