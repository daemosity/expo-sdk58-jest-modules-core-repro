# [SDK 58][jest-expo] Cannot find module 'expo-modules-core' when npm nests it under `expo`

> Reproduction for expo/expo#NNNN. I'll archive this repo once it's resolved.
<!-- TODO: replace NNNN after filing the issue -->

## Summary

After upgrading an npm project from SDK 57 to SDK 58 with the [upgrade guide's](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/) commands, every Jest test file fails to load:

```text
Cannot find module 'expo-modules-core' from 'node_modules/jest-expo/src/preset/setup.js'
```

`jest-expo`'s preset loads `expo-modules-core`, but `jest-expo` doesn't declare it as a dependency. It relies on npm placing `expo-modules-core` at the top level of `node_modules`. In projects that use Reanimated (and so `react-native-worklets`, which is in the default template), npm places it under `node_modules/expo/node_modules/` during the upgrade, and `jest-expo` can't find it there.

`npx expo-doctor` reports 20/20 in this state. I couldn't find a workaround that keeps both the tests and expo-doctor passing (see [Workarounds](#workarounds)).

## Steps to reproduce

Platform-independent (Jest). Package manager: npm.

### Failing state

```bash
git clone https://github.com/daemosity/expo-sdk58-jest-modules-core-repro.git
cd expo-sdk58-jest-modules-core-repro
npm ci
npm test
```

```text
> expo-sdk58-jest-modules-core-repro@1.0.0 test
> jest

 FAIL  __tests__/smoke-test.js
  ● Test suite failed to run

    Cannot find module 'expo-modules-core' from 'node_modules/jest-expo/src/preset/setup.js'

    To mock a module that does not exist on disk, pass `{virtual: true}` in the mock options. See https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options

      at Resolver._throwModNotFoundError (node_modules/jest-resolve/build/index.js:1031:11)

 FAIL  __tests__/mock-reaches-expo-test.js
  ● Test suite failed to run

    Cannot find module 'expo-modules-core' from 'node_modules/jest-expo/src/preset/setup.js'

    To mock a module that does not exist on disk, pass `{virtual: true}` in the mock options. See https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options

      at Resolver._throwModNotFoundError (node_modules/jest-resolve/build/index.js:1031:11)

Test Suites: 2 failed, 2 total
Tests:       0 total
Snapshots:   0 total
Time:        2.667 s, estimated 5 s
Ran all test suites.
```

```bash
grep -n '"node_modules/.*expo-modules-core"' package-lock.json
```

```text
6774:    "node_modules/expo/node_modules/expo-modules-core": {
```

### Replay the upgrade

The `sdk57-baseline` tag is the project before the upgrade. Tests pass there:

```bash
git switch --detach sdk57-baseline
npm ci
npm test
```

```text
> expo-sdk58-jest-modules-core-repro@1.0.0 test
> jest

 PASS  __tests__/smoke-test.js
 PASS  __tests__/mock-reaches-expo-test.js

Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        7.134 s
Ran all test suites.
```

Then run the upgrade guide's two commands:

```bash
npm install expo@^58.0.0
npx expo install --fix
rm -rf node_modules && npm ci
npm test                 # Cannot find module 'expo-modules-core'
npx expo-doctor@latest   # 20/20
```

## Expected vs. actual

**Expected:** After following the upgrade guide, `jest-expo`'s preset loads, or `expo-doctor` reports a problem.

**Actual:** Both test files fail to load with `Cannot find module 'expo-modules-core'`, and `expo-doctor` reports 20/20:

```text
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```

The two tests are a smoke test and a check that `jest-expo`'s `expo-modules-core` mock applies to the copy that `expo` loads ([`__tests__/mock-reaches-expo-test.js`](__tests__/mock-reaches-expo-test.js)).

## Why npm nests it

`expo-modules-core` declares an optional peer dependency on `react-native-worklets`, and the ranges for SDK 57 and SDK 58 don't overlap:

| Package | `react-native-worklets` peer range |
|---|---|
| `expo-modules-core@57.0.23` | `^0.7.4 \|\| ^0.8.0 \|\| ^0.9.0 \|\| ^0.10.0` |
| `expo-modules-core@58.0.22` | `>=0.13.0` |

The upgrade guide upgrades `expo` first, while the project still has `react-native-worklets@0.10.1` from SDK 57. These experiments, run from `sdk57-baseline`, change only how `worklets` is handled:

| | Command | `expo-modules-core` placement |
|---|---|---|
| A | `npm install expo@^58.0.0` (the guide's step) | nested under `expo` |
| B | `npm install expo@^58.0.0 react-native-worklets@0.13.0` | top level |
| C | `npm install react-native-worklets@0.13.0`, then `npm install expo@^58.0.0` | top level |
| D | `npm install expo@^58.0.0 --legacy-peer-deps` | top level |

To run a row:

```bash
git switch --detach sdk57-baseline && npm ci
npm install expo@^58.0.0 --package-lock-only # row A; swap in B, C, or D
grep -n '"node_modules/.*expo-modules-core"' package-lock.json
git checkout -- .                            # reset before the next row
```

I ran rows A and B as real installs using npm 11.20.0.

These results are consistent with a peer-range conflict: while `worklets@0.10.1` is at the top level, `expo-modules-core@58` can't be placed there without violating its peer range, so npm nests it. `npx expo install --fix` later upgrades `worklets`, but npm doesn't move `expo-modules-core` back up. I worked this out by experiment, not from npm's source.

I'm not reporting the peer range as a bug. It's how this project ends up with a layout that `jest-expo` can't handle.

## Workarounds

| Option | `expo-modules-core` placement | `npm test` | `expo-doctor` |
|---|---|---|---|
| As upgraded (the guide's steps) | nested | fails | 20/20 |
| `npm update expo-modules-core` | top level | passes | 20/20 |
| `npx expo install expo-modules-core` | top level | passes | 19/20: "should not be installed directly" |
| Delete `node_modules` and `package-lock.json`, then `npm install` | top level | passes | 20/20 |

- `npm update expo-modules-core` works today, but it depends on where npm places the package. Nothing keeps it there on later installs.
- Declaring `expo-modules-core` directly fixes the tests, but expo-doctor flags it.
- Regenerating the lockfile re-resolves every dependency version in the project, which is a much larger change than this calls for. Both have to go: when I deleted only `package-lock.json` and kept `node_modules`, the tests still failed.

## History

- [#44647](https://github.com/expo/expo/issues/44647) reported the same error on SDK 55.
- [#44874](https://github.com/expo/expo/pull/44874) added `expo-modules-core` to `jest-expo`'s dependencies.
- [#45048](https://github.com/expo/expo/pull/45048) removed it on purpose to break a dependency cycle in the monorepo. Its description explains the trade-off, and it added a `TODO` above the mock noting the dependency chain. This report is a concrete user-facing case of that TODO.

No published `jest-expo` version from 55.x to 58.x declares `expo-modules-core`. On `main`, `setup.js` still references it by bare name at [L256](https://github.com/expo/expo/blob/59dfdddbc0ba848435363f0c731b11eea59cc62f/packages/jest-expo/src/preset/setup.js#L256), [L257](https://github.com/expo/expo/blob/59dfdddbc0ba848435363f0c731b11eea59cc62f/packages/jest-expo/src/preset/setup.js#L257), and [L342](https://github.com/expo/expo/blob/59dfdddbc0ba848435363f0c731b11eea59cc62f/packages/jest-expo/src/preset/setup.js#L342) (as of `59dfddd`, 2026-10-17).

## Open fix: #46104

[#46104](https://github.com/expo/expo/pull/46104) by Vincent Ong seems to take a good approach: it resolves `expo-modules-core` normally first, and falls back to resolving it from the installed `expo` package. In this repro I found it needs one more change; `jest.doMock('expo-modules-core', …)` still receives the bare name, and Jest resolves that argument when `doMock` is called, so the suite fails before the mock factory runs.

| Branch | What it contains | `npm test` | `expo-doctor` |
|---|---|---|---|
| `main` | The upgraded project | fails to load | 20/20 |
| [`verify/pr-46104`](../../tree/verify/pr-46104) | #46104's source changes, applied with patch-package | fails to load (at `jest.doMock`) | 20/20 |
| [`verify/pr-46104-plus-domock`](../../tree/verify/pr-46104-plus-domock) | The same, plus `jest.doMock(resolveExpoModulesCoreModuleId(), …)` | 2 passed | 20/20 |

The one-line difference: [`verify/pr-46104...verify/pr-46104-plus-domock`](../../compare/verify/pr-46104...verify/pr-46104-plus-domock)

To try a branch, switch to it and run `npm ci && npm test`. The patch is reapplied by the `postinstall` script.

Tested against #46104 at commit `8789453`. As of 2026-10-18, #46104 conflicts only in `CHANGELOG.md`; the repo now uses changesets.

## Scope

**Tested:**
- npm 11.20.0 (real install). npm 10.9.4 also nests it (lockfile-only).
- The trigger is `react-native-worklets`, directly or through Reanimated. A blank template without it doesn't nest. The `default` template also nests it with no added packages (lockfile-only).

**Not tested:**
- yarn, pnpm and bun on this upgrade path. In [#44874](https://github.com/expo/expo/pull/44874), the maintainer noted that the original issue didn't occur with them.
- Expo's own monorepo, and Windows.

## Related

- [#51484](https://github.com/expo/expo/issues/51484): about the same `react-native-worklets` peer range in `expo-modules-core`.

## Environment

```text
expo-env-info 2.2.1 environment info:
    System:
      OS: Linux 6.18 Ubuntu 24.04.5 LTS 24.04.5 LTS (Noble Numbat)
      Shell: 5.2.21 - /bin/bash
    Binaries:
      Node: 26.12.0 - ~/.nvm/versions/node/v26.12.0/bin/node
      npm: 11.20.0 - ~/.nvm/versions/node/v26.12.0/bin/npm
      Watchman: 2025.11.10.00 - /home/linuxbrew/.linuxbrew/bin/watchman
    SDKs:
      Android SDK:
        API Levels: 15, 34, 35, 36
        Build Tools: 34.0.0, 35.0.0, 36.0.0
    npmPackages:
      expo: ^58.0.14 => 58.0.14 
      react: 19.3.0 => 19.3.0 
      react-native: 0.88.0 => 0.88.0 
    Expo Workflow: managed
```

Recorded: 2026-10-18

## How this repo was built

1. [`d687f88`](../../commit/d687f88) Initial commit: unmodified `npx create-expo-app@latest --template blank@sdk-57` output.

2. SDK 57 baseline (tag `sdk57-baseline`):
   - [`c5ace52`](../../commit/c5ace52) Install `react-native-worklets`, `jest-expo` and `jest`:

     ```bash
     npx expo install react-native-worklets
     npx expo install jest-expo jest --dev
     ```

   - [`385817f`](../../commit/385817f) Add the `test` script and the `jest-expo` preset:

     ```bash
     npm pkg set scripts.test=jest jest.preset=jest-expo
     ```

   - [`48e84fd`](../../commit/48e84fd) Add the two test files in `__tests__/`.

3. [`12ed4be`](../../commit/12ed4be) Upgrade to SDK 58 (tag `sdk58-upgraded`):

     ```bash
     npm install expo@^58.0.0
     npx expo install --fix
     ```

     Changes to `package.json`:

     ```diff
     "dependencies": {
     -    "expo": "~57.0.30",
     -    "expo-status-bar": "~57.0.1",
     -    "react": "19.2.3",
     -    "react-native": "0.86.3",
     -    "react-native-worklets": "0.10.1"
     +    "expo": "^58.0.14",
     +    "expo-status-bar": "~58.0.3",
     +    "react": "19.3.0",
     +    "react-native": "0.88.0",
     +    "react-native-worklets": "0.13.0"
     },
    ...
     "devDependencies": {
     -    "jest": "~29.7.0",
     -    "jest-expo": "~57.0.6"
     +    "jest": "~30.5.2",
     +    "jest-expo": "~58.0.11"
     },
     ```

   - `--fix` also added an `expo-status-bar` entry to `plugins` in `app.json`. It's unrelated to this issue.

4. [`faec482`](../../commit/faec482) on `verify/pr-46104`: #46104's source changes, applied with patch-package.

5. [`b405ff5`](../../commit/b405ff5) on `verify/pr-46104-plus-domock`: the one-line `jest.doMock` change.

> [!NOTE]
> `patches/` contains source changes from [expo/expo#46104](https://github.com/expo/expo/pull/46104) by Vincent Ong (expo/expo is MIT-licensed), plus one added line on the `verify/pr-46104-plus-domock` branch.
