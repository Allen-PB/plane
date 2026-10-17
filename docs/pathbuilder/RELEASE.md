# PathBuilder release procedure

1. Review the code diff and CI result. Keep the license and source-offer obligations
   applicable to the exact release. No enterprise license restrictions are removed.
2. Build custom web, admin, space, and backend Docker images using the release's
   existing Dockerfiles and immutable company version tags. The API, worker, and
   beat containers must use the same custom backend image for email changes.
3. Test with a separate staging database, object store, Redis, and message broker.
   Do not attach staging services to production Docker volumes. Keep outgoing
   email captured locally or directed only to an explicitly approved test mailbox.
4. Check all three apps, theme variants, login/logout, workspace access, upload and
   download, invitation, password reset, and actual received email rendering.
5. Check the two public email-image URLs anonymously. Publish the web assets before
   rolling out the backend email changes. Verify the proxy serves /branding/\*.png
   from the web container. Check the configured sender display name in admin.
6. Before production changes, take and verify a fresh database dump, attachments,
   Compose file, and environment backup. Store a copy off the Droplet. Test a restore
   into isolated resources; reading pg_restore --list is not a restore test.
7. Change only the intended image tags in the existing production deployment.
   Confirm volume names and all secrets remain correct before recreating services.
   Do not run `docker compose down -v` against production.
8. Observe health and application workflows after rollout. Keep the previous image
   tags and configuration. Roll back images only when database schemas remain
   compatible; migrations may require the tested database/attachment restore plan.

No deployment is performed by the branding patch or local installer. The existing
DigitalOcean instance, database, and working SMTP configuration remain untouched.
