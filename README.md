# StudioStack

StudioStack is the production-desk application for equipment inventory,
reservations, reports, and administration. The primary web application uses
Next.js and React.

## Local development

```bash
npm ci
npm run dev
```

The application is available at `http://localhost:5174`.

## Configuration safety

Keep local configuration in `.env.local`. Environment files and common
credential formats are ignored by Git and must never be committed. Only add an
`.env.example` file when it contains placeholder values with no credentials.
