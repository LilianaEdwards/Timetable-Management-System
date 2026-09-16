## Login-only repair

- Remove the sign-in page's automatic session refresh, which is currently retrying an expired saved token before credentials are submitted.
- Clear only the stale local login state before a new email/password sign-in, without changing accounts, roles, timetable data, pages, or scheduling rules.
- Keep the existing sign-in and sign-up portal and improve its error handling so connection failures are shown clearly instead of breaking the page.
- Verify the admin account can sign in and confirm the existing dashboard counts and all admin panels remain available.

## Technical details

- The captured failing request is a refresh-token request, not the password sign-in request.
- The fix will be limited to the authentication page and will preserve all other project information.
