# Security

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting:
**Security → Report a vulnerability** on this repository.

Include the Emberfox version (Studio → About), steps to reproduce, and impact.

## Scope

- **Emberfox's own code** (Ember Studio, the boot engine, build and packaging scripts,
  prefs and policies): report here.
- **Gecko/Firefox engine bugs**: report to Mozilla at https://www.mozilla.org/security/bug-bounty/
  Emberfox picks up Mozilla's fix automatically. The *Firefox watch* workflow
  publishes a new Emberfox within hours of each Firefox release.

## Staying patched

Emberfox removes Mozilla's updater (it would replace Emberfox with stock Firefox).
Update through your package manager, or turn on Studio → About → *Tell me when a
new Emberfox is out* (on by default) and grab the new release.

## Verifying downloads

Every release ships `SHA256SUMS`:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```
