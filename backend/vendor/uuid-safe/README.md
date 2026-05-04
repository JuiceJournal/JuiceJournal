# uuid-safe

This package is a minimal CommonJS-compatible `uuid` shim for Sequelize 6.

Sequelize 6.37.x depends on `uuid@8`, while npm currently flags every `uuid`
release before 14.0.0 for buffer-output handling in v3/v5/v6. Sequelize only
uses `v1()` and `v4()` in this project, so this shim provides those APIs through
Node's `crypto` module and rejects buffer-output mode entirely.
