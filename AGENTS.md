# Pull request scope

- Keep each pull request focused on one feature or a necessary supporting change.
- Prefer a few hundred meaningful changed lines. Keep generated files and lockfile changes tied to the feature that needs them.
- Split separately reviewable schema, API, interface, calendar, attachment, notification, and deployment work into focused pull requests.
- Use stacked pull requests for dependencies. Explain the base branch, review/merge order, scope, and validation in each description.
- Keep every intermediate branch buildable and tested. Preserve behavior when reorganizing an existing change.
- Do not automatically request Copilot reviews. Request an automated reviewer only when the user explicitly asks.
