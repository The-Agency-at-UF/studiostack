-- Feature requests share app.bug_reports; existing rows stay bug reports.
ALTER TABLE app.bug_reports ADD COLUMN kind text NOT NULL DEFAULT 'bug' CHECK(kind IN ('bug','feature'));
