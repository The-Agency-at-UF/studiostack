# StudioStack

Production operations, equipment reservations, and inventory management for The Agency at UF.

## Table of contents

- [What is StudioStack?](#what-is-studiostack)
- [Project outline](#project-outline)
- [Project documentation](#project-documentation)
- [What the application does today](#what-the-application-does-today)
- [Pages and access](#pages-and-access)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Available commands](#available-commands)
- [How to contribute](#how-to-contribute)
- [How to review code](#how-to-review-code)

## What is StudioStack?

StudioStack is the shared production desk for The Agency at UF. It gives students and administrators one place to reserve equipment, track checkouts and returns, report equipment problems, manage teams, and understand how production resources are being used.

The active web application is built with Next.js and React. The repository also contains an archived `legacy/` application for reference while the current product is developed.

## Project outline

**The problem:** Production teams need a reliable way to coordinate shared equipment. Reservations, availability, overdue items, issue reports, and approved-user access become difficult to manage when the information is spread across separate tools or manual processes.

**The solution:** StudioStack centralizes the equipment workflow. Students can plan and manage reservations, while administrators can oversee inventory, users, teams, reports, and operational statistics from the same interface.

**Who it serves:**

- Students and production team members reserving or returning equipment
- Production administrators managing access and equipment operations
- Internal and client teams coordinating project resources

**Current project status:** The web interface and automated quality checks are active. The persistent backend and institutional authentication integrations are being developed separately from the UI.

## Project documentation

Start with the [documentation index](docs/README.md) for maintained product requirements, Agency brand guidance, and the previous senior-project handoffs.

## What the application does today

- Dashboard summaries for upcoming reservations, reserved equipment, and notifications
- Calendar views for past and upcoming reservations
- Reservation creation, editing, extension, cancellation, checkout, and return flows
- Equipment issue reporting and resolution workflows
- Inventory browsing, filtering, search, status indicators, and QR-code support
- Team and client-team administration
- Approved-user and role administration
- Operational statistics for equipment, reservations, overdue history, and reports
- Responsive navigation and layouts for desktop and smaller screens

## Pages and access

| Page | Access | Purpose |
| --- | --- | --- |
| Home / Dashboard | Students and admins | Shows upcoming reservations, reserved equipment, notifications, overdue alerts, and shortcuts. |
| Calendar | Students and admins | Displays reservations in month, week, and day views with reservation details. |
| Reservations | Students and admins | Lists active and past reservations and provides reservation-management actions. |
| Reports | Students and admins | Lets users submit equipment issues and lets admins review and resolve reports. |
| Statistics | Admin only | Summarizes overdue equipment, reservation activity, inventory, and report trends. |
| Teams / Clients | Students and admins | Lists internal and client teams; admins can manage the list. |
| Users | Admin only | Manages approved users and their roles. |
| Inventory | Access under review | Lists equipment, categories, statuses, identifiers, and QR codes; admin management is supported. |

## Tech stack

### Application

- [Next.js](https://nextjs.org/) for routing, static generation, and the web application framework
- [React](https://react.dev/) for the component-based interface
- JavaScript with a planned migration path to TypeScript
- [Tailwind CSS](https://tailwindcss.com/) and project styles for responsive presentation

### Product features

- [FullCalendar](https://fullcalendar.io/) for reservation calendar views
- [Recharts](https://recharts.org/) for operational data visualization
- QR and barcode libraries for equipment identification workflows

### Quality and delivery

- [Vitest](https://vitest.dev/) and Testing Library for unit and integration tests
- [ESLint](https://eslint.org/) for code quality checks
- GitHub Actions for pull-request validation and post-merge integration testing
- Node.js 22 in continuous integration

## Repository structure

```text
studiostack/
├── .github/workflows/   # Pull-request and main-branch automation
├── app/                 # Next.js routes and layouts
├── docs/                # Product, brand, and historical documentation
├── public/              # Static public assets
├── src/
│   ├── assets/          # Application images and brand assets
│   ├── components/      # Shared interface components
│   ├── context/         # Shared React context
│   ├── integration/     # Integration tests
│   └── views/           # Page-level feature views
├── legacy/              # Archived earlier implementation
├── package.json         # Scripts and dependencies
└── next.config.mjs      # Next.js configuration
```

New application work belongs in the root `app/` and `src/` directories. Do not add new product work to `legacy/`.

## Prerequisites

Before getting started, install:

- [Node.js](https://nodejs.org/) 22 or newer
- npm, included with Node.js
- [Git](https://git-scm.com/)
- A code editor such as [Visual Studio Code](https://code.visualstudio.com/)

## Getting started

1. Clone the repository:

   ```bash
   git clone https://github.com/The-Agency-at-UF/studiostack.git
   cd studiostack
   ```

2. Install the locked dependencies:

   ```bash
   npm ci
   ```

3. Start the local development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:5174](http://localhost:5174) in your browser.

Keep local-only configuration in `.env.local`. Never commit credentials, access tokens, or private keys.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server on port 5174. |
| `npm run lint` | Run ESLint across the project. |
| `npm test` | Run the unit-test suite once. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run test:integration` | Run the integration-test suite. |
| `npm run test:ui` | Open the Vitest test interface. |
| `npm run build` | Create and validate the production build. |
| `npm start` | Serve a production build locally. |

## How to contribute

All changes should go through a feature branch and pull request. Direct pushes to `main` are not part of the normal workflow.

1. Update your local `main` branch:

   ```bash
   git checkout main
   git pull origin main
   ```

2. Create a focused branch:

   ```bash
   git checkout -b <type>/<short-description>
   ```

   Common branch types include `feature/`, `fix/`, `docs/`, `test/`, and `chore/`.

3. Make the change and run the required checks:

   ```bash
   npm run lint
   npm test
   npm run build
   ```

4. Commit and publish the branch:

   ```bash
   git add .
   git commit -m "Describe the change"
   git push -u origin <branch-name>
   ```

5. Open a pull request into `main` and request review from at least one other organization member.

Keep pull requests focused and reviewable. Aim for approximately 500 changed lines or fewer when the work can be split safely; generated files and dependency lockfiles may be larger.

## How to review code

1. Read the pull-request summary and confirm the scope is clear.
2. Check out the branch locally and install dependencies with `npm ci`.
3. Run the quality checks:

   ```bash
   npm run lint
   npm test
   npm run build
   ```

4. Start the app with `npm run dev` and test the changed workflow in the browser.
5. Check responsive behavior and the browser console for unexpected errors or warnings.
6. Review the **Files changed** tab and leave comments on specific lines when possible.
7. Submit the review as **Approve**, **Request changes**, or **Comment**.

GitHub Actions runs linting, unit tests, and a production build on pull requests to `main`. After merge, the main pipeline runs the integration-test suite.
