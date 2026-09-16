# Visualizer-format profile fixture

`visualizer-profile.tcl` is a synthetic test fixture reconstructed from the
existing end-to-end assertions in `test/tcl-profile.test.mjs`. It is not the
original Visualizer export or a recommended machine profile. Its title, author
and notes exercise metadata parsing and retain the existing assertions.

The original test referenced a local file under `shots/` that is explicitly
ignored and was never committed. Keeping this fixture under `test/fixtures/`
makes a fresh checkout testable without personal shot data. It exercises nested
Tcl lists, names containing spaces, multiline notes, empty values, both pump
modes, enabled and disabled exits, and flow/pressure limiters. The release
whitelist excludes all test fixtures.
