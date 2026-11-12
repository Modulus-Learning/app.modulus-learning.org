---
"@modulus-learning/core": minor
"@modulus-learning/host-tanstack-start": minor
"@modulus-learning/lms-canvas": minor
"@modulus-learning/lti": minor
---

added editable lti registration endpoints: administrators now enter or confirm each platform endpoint, and the lms adapter only suggests defaults

- Administrators holding `lti-platforms:edit` can edit a registration's name, client ID, authorization endpoint, token endpoint, JWKS URI and authorization server at `/admin/lti-platforms/$id/edit`. The issuer can't be changed. An edit applies on the next login, launch or score-passback reconcile, without a restart. The create form gains the four endpoint fields and a "Fill defaults from issuer" button.
- Hosted-Canvas installations should change the authorization endpoint to `https://sso.canvaslms.com/api/lti/authorize_redirect` (or `sso.beta.canvaslms.com` / `sso.test.canvaslms.com` for the beta and test issuers) from the edit form, because Instructure has deprecated the old `canvas.instructure.com` authorization host. Existing registrations are not rewritten automatically. The Canvas adapter now suggests the `sso.*` host for new registrations; the token endpoint, JWKS URI and authorization server stay on the issuer host.
- `modulus db upgrade` grants the Manager role `lti-platforms:read` and `lti-platforms:edit`, and also the allowlist abilities `activity-url-allowlist:list` and `activity-url-allowlist:manage` that earlier upgrades missed.
- A new registration's issuer can't end in a slash, because launches match it exactly against the `iss` claim.
- An administrator who is already signed in may need to sign in again before the Edit button appears.
