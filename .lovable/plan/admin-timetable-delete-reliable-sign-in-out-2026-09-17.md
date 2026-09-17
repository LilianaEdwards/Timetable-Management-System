# Admin timetable delete + reliable sign in/out

## What changes

1. **Admin can delete the timetable**
   - On the Generate page, add a "Delete timetable" action next to Generate that clears the saved timetable for the selected semester, with a confirmation step first.
   - On the Timetable page, admins get the same delete action for the semester they are viewing; students and lecturers do not see it.
   - After deleting, the grid refreshes immediately and empty cells show as Self-Study.

2. **Sign in works reliably**
   - Keep the current sign-in page, and after a successful sign in send admins to the Dashboard and students/lecturers to their own schedule page, so nobody lands on a page they cannot open.

3. **Sign out works properly**
   - Sign out now stops any pending data requests, clears the cached data from the previous account, ends the session, and returns to the sign-in page without leaving it in the back history.
   - The Logout button shows a short "signing out" state and always lands on the sign-in page even if the network hiccups.

## Verification

Sign in as the admin account, generate a timetable, delete it and confirm the grid empties, generate again, then sign out and confirm the sign-in page appears and the back button does not restore the admin pages. Repeat sign in/out once with a student account to confirm the delete action is hidden.

## Technical details

- New `deleteTimetable` server function in `src/lib/timetable.functions.ts` using `requireSupabaseAuth` plus a `has_role(admin)` check, deleting `timetable_entries` rows filtered by `semester`; existing admin-only RLS on the table stays as-is.
- `src/routes/generate.tsx` and `src/routes/timetable.tsx` call it via `useServerFn` and invalidate the `timetable-entries` query; the timetable button is gated on `isAdmin`.
- Sign-out in `src/components/AppShell.tsx` follows the ordered teardown: `queryClient.cancelQueries()` → `queryClient.clear()` → `supabase.auth.signOut()` → `navigate({ to: "/auth", replace: true })`.
- Post-sign-in redirect in `src/routes/auth.tsx` reads the user's role via `has_role` and navigates to `/` or `/my-schedule`.
- No schema migration, and no change to scheduling rules, joint-subject handling, or existing data.
