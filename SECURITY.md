# Security

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting:
**Security → Report a vulnerability** on this repository.

Include the Ignifox version (Studio → About), steps to reproduce, and impact.

## Scope

- **Ignifox's own code** (Ignifox Studio, the boot engine, build and packaging scripts,
  prefs and policies): report here.
- **Gecko/Firefox engine bugs**: report to Mozilla at https://www.mozilla.org/security/bug-bounty/
  Ignifox picks up Mozilla's fix automatically. The *Firefox watch* workflow
  publishes a new Ignifox within hours of each Firefox release.

## Staying patched

Ignifox removes Mozilla's updater (it would replace Ignifox with stock Firefox).
Update through your package manager, or turn on Studio → About → *Tell me when a
new Ignifox is out* (on by default) and grab the new release.

## Verifying downloads

Every release ships `SHA256SUMS`:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```
