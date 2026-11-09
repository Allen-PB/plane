# Atlas ticket lookup in Sync

Atlas uses a dedicated Sync account with active membership in the approved pilot project. Use Guest membership and give the account access only to that project. The integration accepts a separate credential at one Sync endpoint. Ordinary Sync API tokens and session cookies do not authenticate this endpoint. The Atlas key is never registered as an ordinary Sync API token.

## Staging setup

1. Connect to the Sync dev host using the SSH target in [tools/connect-dev.ps1](../../tools/connect-dev.ps1). The dev API is accessible through the host's loopback proxy on port 8080. Confirm the running API image and source revision, API-key authentication, token model, permission checks, and request logging. Confirm dev is isolated from production.
2. Confirm the approved project UUID, workspace slug, and dedicated Sync account UUID. If provisioning a new account, use a dedicated account with an unusable password and no ordinary API tokens. Grant it active Guest membership in the pilot project.
3. Generate a key with the prefix `atlas_sync_` followed by 32 cryptographically random bytes encoded as hex. Store the full key only in Atlas staging's secret store. Use the SHA-256 hex digest of the full key for `ATLAS_SYNC_KEY_SHA256` in the Sync staging API environment. Set `ATLAS_SYNC_USER_ID` and `ATLAS_SYNC_PROJECT_ID` to the canonical UUIDs. Keep key material out of shell arguments, source control, and request traces.
4. Deploy the Sync API change to dev. It requires no database migration. Keep dev private and make sure request logging at the proxy and API redacts `X-Api-Key`.
5. Configure the Atlas staging connector to send the key in `X-Api-Key` on the request below. Use an authorized private path, such as an SSH tunnel, from the Atlas staging runtime to the Sync dev loopback proxy. Run direct API checks on the Sync dev host over SSH or through the tunnel.

```text
GET /api/v1/integrations/atlas/workspaces/{slug}/projects/{project_uuid}/tickets/{ticket_uuid}/
```

The response fields are `id` (ticket UUID), `title`, `status` (display name or null if unassigned), and `link` (the Sync web URL). Query parameters do not expand the response. The lookup excludes archived and draft work items and triage intake, consistent with Sync's standard work-item lookup.

## Acceptance checks

Use the same key from the Atlas staging secret store for each request. Record response status and field names without dumping headers or unrelated ticket details.

1. GET an approved pilot ticket and verify HTTP 200 plus its ID, title, status, and link. Follow the link in a permitted Sync session to verify it opens the same ticket.
2. GET a ticket that is known to exist in another project. Expect HTTP 404 with the same body as a missing ticket and no ticket details. Retry with the approved project UUID and the other ticket UUID and expect the same denial.
3. Capture a disposable pilot ticket's current state. PATCH the integration endpoint and the normal `/api/v1/workspaces/{slug}/projects/{project_uuid}/work-items/{ticket_uuid}/` endpoint using the Atlas key. Expect HTTP 405 and HTTP 403 respectively. Read the ticket back and compare it with the original state. Verify the Atlas key also fails a GET on the normal endpoint.

Disable the integration by clearing its configured digest, removing the pilot membership, or deactivating the dedicated account. Rotate the key by replacing the digest in Sync and the corresponding secret in Atlas.

## Sync dev verification on 9 November 2026

- API image `pathbuilder-dev-backend:atlas-sync-pilot-20261109-01` runs on `dev-plane-sync-sgp1`. The prior image was `pbs9-profile-permissions-20261102-01` at revision `b9d6878f408e20f948bea844467e2656bf353b24`.
- The dedicated Atlas Sync Integration account has Guest access in the PathBuilder workspace and only the approved Workflow QA project (`WFQA`).
- All three checks passed over SSH via the dev loopback proxy using the provisioned Atlas credential. The other-project response matched a missing ticket. Both PATCH requests were denied, the disposable ticket's database row was unchanged, and the ticket was removed afterward.
- The deployment marker and verification log are under `/opt/pathbuilder-dev/releases/atlas-sync-pilot-20261109-01/`. The credential is in root-only storage on Sync dev for secure handoff to the Atlas staging runtime.

## Atlas connector smoke test

The Atlas base runtime, Open WebUI `v0.13.2-slim`, loaded an inline OpenAPI schema exposing one Workflow QA lookup by ticket UUID. A temporary container on Sync dev used the host loopback proxy and mounted the same verified credential as a read-only secret. Atlas's native OpenAPI tool runner returned the four fields for the approved ticket and received HTTP 404 for an unavailable ticket. The temporary runtime exited after the test. The smoke log contains no raw key.

The schema and smoke evidence are in `atlas-staging/` under the dev release directory. This smoke test invokes the tool directly.

## Atlas staging chat verification on 10 November 2026

Atlas staging and Ollama run on the Sync dev host and listen only on loopback ports 18080 and 11435. The staging Atlas profile uses Qwen3 0.6B with Atlas's model-driven tool-selection mode and the Workflow QA tool selected by default. The Sync key is mounted read-only from root-only storage. Production was untouched.

Atlas received a chat prompt containing the approved ticket UUID and no ticket field values. Its final answer matched the stored ID, title, status, and link exactly. Sync recorded a fresh HTTP 200 with the same credential identifier as the prior direct tests. The native tool-calling trials fabricated details without calling Sync, so staging uses the verified tool-selection mode.

The passing chat summary and `CHAT_VERIFIED` marker are in the dev release's `atlas-staging/` directory. An initial Atlas validation error included the key in the first staging container's local log. That container and its local log were removed. The replacement staging container has Docker logging disabled, and the saved passing transcript contains no raw key.

## Staging credential rotation on 10 November 2026

The key from the initial staging log was revoked on Sync dev. It returned HTTP 403 with no ticket data. The replacement returned HTTP 200 and was loaded by Atlas staging. A fresh model-driven chat returned the approved ticket's exact ID, title, status, and link. The new HTTP 200 audit entry matched the replacement credential, and the saved chat log and transcript contain no raw replacement key. Evidence is in `atlas-staging/rotation-chat-verification.log` and `atlas-staging/ROTATED_CHAT_VERIFIED` under the dev release directory. Production was untouched.

The replacement key also passed both denial checks. A known other-project ticket returned the same generic HTTP 404 as a missing ticket, including when the approved project ID was substituted. PATCH returned HTTP 405 on the Atlas endpoint and HTTP 403 on the regular Sync API. The disposable ticket's entire database row was unchanged, and the ticket was removed afterward. Evidence is in `atlas-staging/rotation-denials-verification.log`.
