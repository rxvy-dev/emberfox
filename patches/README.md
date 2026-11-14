# patches/

Optional source patches for `./build.sh source`. Every `*.patch` here is applied
with `patch -p1` against the Firefox source tree, in name order.

Emberfox's core doesn't need any: telemetry is compiled out with mozconfig flags
and locked off with autoconfig + enterprise policies, and Ember Studio runs as a
privileged chrome module. Keeping engine patches at zero is what lets Emberfox
follow every Firefox release on day one.

Name patches `NNN-short-description.patch` and keep each one small.
