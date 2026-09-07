# Explicit Release Automation

Run commands from `imperium-like-digital-prototype`. The release helper uses the existing `origin` Git remote and its `main` tip. It deploys only a full SHA verified as that remote tip. It does not publish uncommitted local work.

```powershell
npm.cmd run test:release
npm.cmd run verify:rules
npm.cmd run release -- --commit <full-sha> --service srv-d9g4jvr7uimc73ec4teg --origin https://polity-engine.onrender.com --dry-run
npm.cmd run release -- --commit <full-sha> --service srv-d9g4jvr7uimc73ec4teg --origin https://polity-engine.onrender.com
```

Configure `RENDER_API_KEY` in the local environment. Do not put its value in commands, source control, screenshots, or reports. Dry-run reads GitHub/Render configuration without deploying or creating test lobbies. The live command can deploy and runs existing hosted smoke/browser workflows, which create fictional test rooms.

## Checks

- Remote commit, service repository, branch and URL must agree.
- The release helper runs `verify:rules`, which requires the full engine regression suite and the independent source-backed rules audit, before contacting Render for deployment.
- Production origin, private-debug setting, storage path, optional build-commit override and persistent disk must match expected values. Drift fails the release; no configuration is silently rewritten.
- Root directory, Node runtime, build/start commands and health-check path must match the checked-in service configuration. Environment/deployment lists are paginated before any decision.
- A per-service local filesystem lock prevents concurrent helper invocations from submitting duplicate deployments from this checkout. Separate machines must still coordinate releases.
- A matching active or live deployment is reused. Another active commit blocks the operation.
- Polling is bounded to 15 minutes with 30-second HTTP timeouts.
- The live commit and browser origin are checked before hosted smoke/browser QA and again after QA.
- Hosted browser QA also asserts the frontend diagnostic commit. Production Vite builds embed `RENDER_GIT_COMMIT`; local testing may provide `VITE_GIT_COMMIT` instead.
- Redacted reports live under ignored `tmp/releases/` and list successful checks and outstanding manual admin/backup tasks.

## Recovery

A POST timeout can mean Render accepted the deployment. The helper records submission uncertainty before returning and never automatically repeats that POST. A later invocation first checks the deploy list for a matching operation. If none is found, inspect Render manually before resolving the report. Do not erase the report simply to bypass uncertainty.

A polling timeout preserves the deployment ID. Rerun to reconnect to a matching active deployment. Failed builds and failed proofs retain controlled status/check names; inspect Render logs or rerun the individual QA command for details. HTTP response bodies and credentials are not copied into release reports.

An interrupted helper can leave `tmp/releases/<service-id>.lock`. Check its process ID and the Render deployment list before removing that specific stale lock. Do not remove a lock owned by a running release process.

Environment updates are separate operations. Reusing an already-live SHA does not apply pending Render configuration edits; deploy such edits explicitly and rerun proof. A drift-free API configuration is not itself proof of the running process, which is why the live origin check is required.

## Rollback

Before reverting engine/state-schema changes, verify the earlier build can read current persisted matches and local-save schemas. Preserve a private storage backup first. This helper intentionally accepts only the remote main tip; an emergency rollback to an earlier SHA is a separate reviewed operation. Never point an incompatible old engine at the only copy of newer saved state.
