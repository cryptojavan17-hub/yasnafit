# Yasnafit Changelog

Application versions follow Semantic Versioning. `package.json.version` is the current application version; SQLite migration IDs and Git commits are separate identifiers. Structured release data is also available through `GET /api/releases`.

## 0.9.0 — 2026-08-23

### Features
- Added a single global theme token file shared by coach and private portal shells.
- Added permanent `coaches` and `coach_students` ownership foundations.
- Added a dormant `assessment_ai_suggestions` structure for future coach-reviewed suggestions; no AI is called in production.
- Added a unique six-digit display-only case number for every شاگرد.
- Added exactly three secure invitation entries, each issuing an independent hashed session.
- Added neutral, no-facial-detail pose guides for all five optional body-photo slots.
- Added current release date and latest changes to the coach dashboard.
- Enforced an exact 30-day start/end range for new monthly programs.

### Fixes and security
- Made body photos fully skippable without forcing a refusal choice.
- Kept token hashes, revocation, expiry, rate limiting and session isolation intact.
- Added a repository-wide terminology regression guard and corrected stored historical release text during migration.

## 0.8.0 — 2026-08-23

### Features
- Real workout sessions and performed-set results, separate from prescribed sets.
- Student/coach in-app notifications.
- Lightweight student-scoped secure messaging.
- Structured, redacted audit events.
- Coach performance view calculated from actual workout rows.

### Security
- Session-derived workout/message/notification ownership.
- Same-origin checks for student mutations.
- Rate limiting for invitation and join endpoints.

## 0.7.2 — 2026-08-22
- Recovered the onboarding next button after asynchronous saves and timeouts.

## 0.7.1 — 2026-08-22
- Added localized Persian/Arabic measurement parsing on client and server.

## 0.7.0 — 2026-08-22
- Added the normalized ten-step INITIAL/MONTHLY assessment profile.
- Added canonical assessment lifecycle, coach review, rejection and change requests.
- Added optional private medical documents and `/document/edit-document` integration.

## 0.6.0 — 2026-08-22
- Made body photos explicitly optional with willing/declined preference.

## 0.5.0 — 2026-08-22
- Added dedicated student session authentication and separate student portal shell.

## 0.4.0 — 2026-08-22
- Added complete My Students CRM.

## 0.3.0 — 2026-08-22
- Added centralized application versioning and release history.

## 0.2.0 — 2026-08-22
- Added student portal, assessments, private photos and monthly coaching workflow.

## 0.1.0 — 2026-08-22
- Initial local Yasnafit architecture, exercise management and Program Builder.
