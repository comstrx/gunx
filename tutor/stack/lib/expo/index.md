# Expo

## Contract

Expo, React Native, Metro and Hermes belong to the mobile surface. Generic capability remains behind engine ports.

## Structure

The consuming application supplies identity and native configuration. Expo owns native build integration, Metro and SDK compatibility; the part owns any spec compilation and engine adapter composition.

## Rules

- Apply React's renderer contract and resolve host packages from the surface. Follow the selected SDK matrix and bundled native module versions; verify New Architecture and target OS compatibility.
- EXPO_PUBLIC values are embedded and public. Apply the mobile part's storage/security contract through the selected native modules.
- Inspect the actual application bundle and selected entry graph; do not assume browser tree shaking. Verify Hermes bytecode in a release artifact.
- Verify RTL, fonts, safe areas, keyboard, permissions and motion on representative native targets; one phone cannot establish every supported device. Native dependencies earn their startup, frame, memory, size and battery cost.
- Cancel animation work on unmount, mirror directional icons and transformations in RTL and avoid web CSS assumptions in native styling.

### Native lifecycle

- Stop location, camera and event subscriptions when their owner ends. Handle revoked permission and inaccessible secure storage with a designed recovery path.
- Match React to its React Native renderer; duplicate React or mismatched native binaries can fail even when types pass. Metro may inline dynamic imports, so inspect actual release bytes.
- Profile JS and UI threads on representative devices: record release build, OS and workload for startup, sustained scrolling and memory.

### Updates and storage

- Native ABI, compiled permissions/configuration and JavaScript update compatibility must agree through runtimeVersion. Adding native code or changing compiled configuration requires a compatible native build, not only a JavaScript push.
- Update channels select audiences; they are not cryptographic authenticity. Configure signing and key rotation deliberately when using signed updates.
- Update error recovery is a last resort, not a data rollback. An update that changes persisted state can make an older bundle unsafe; assess backward compatibility before rollback and fix forward when required.
- SecureStore is not the sole durable record of irreplaceable data. Uninstall, backup restore, device locks or changed biometrics can affect availability; design reauthentication and recovery.
- Store small secrets in platform secure storage, never large response caches. Do not treat a locally stored role or token as server authorization.
- A generic storage name does not establish a native adapter, encryption or persistence. Verify the installed module and actual surface binding before attributing SecureStore guarantees to a cache port.
- Synchronous authenticated SecureStore access can block the JavaScript thread while authentication completes. Choose the async interface for interactive flows and handle cancellation or unavailable credentials explicitly.

### Lists and memory

- Tune render windows, batch size and scheduling together: fewer mounted rows reduce memory but can expose blank areas or delay interaction.
- Recycled/detached views are not necessarily deallocated. Measure retained memory and repeated screen transitions, not only initial frames.
- Stable keys and item identity matter; precomputed layout requires genuinely fixed geometry. Preserve accessibility, dynamic text and RTL while optimizing.

### Build and run modes

| Mode              | Use                                                            | Evidence limit                                                                    |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Web harness       | Browser rendering, flows and portable logic                    | Does not execute an APK or establish native module, permission or device behavior |
| Expo Go           | Quick checks within its bundled native capabilities            | Does not represent an application's custom native binary                          |
| Development build | App-specific native modules with development tooling and Metro | Development overhead invalidates production performance comparisons               |
| Release build     | Bundled application on emulator/simulator or physical device   | Record actual device/runtime; simulator timing is not phone timing                |

- Choose the existing surface profile and installed SDK's supported operation. Local Android compilation uses Expo's Android run path; a release variant produces a native release build. The iOS run path uses a Release configuration when production behavior is required.
- APK is directly installable on Android devices/emulators; AAB is a store distribution bundle, not a directly installable APK. Debug, development-client, preview and signed production artifacts are distinct.
- Use an available emulator or an owner-authorized phone. Select the intended device, preserve its data and identify the installed build; connection, permission and development-server reachability are separate checks.
- JS-only changes normally reuse the development binary; native modules, permissions or native configuration changes require a matching rebuild. Do not regenerate native directories destructively over custom changes.
- Linux, macOS and Windows support the JS workflow and appropriate Android tooling. Native iOS compilation/simulation needs macOS/Xcode; an authorized remote build can supply an artifact to another host.
- EAS local build is a separate path: official support is Linux/macOS; Windows through WSL is not officially supported. This limitation does not prohibit local Android builds through the normal Android toolchain on Windows.
- A production-JS simulation inside development tooling is not a native release build. Use the latter for startup, frames, retained memory and native integration claims.

### Testing and measurement

- The SDK-aligned jest-expo preset mocks native boundaries. Use it for JS contracts and user-observable component behavior; a passing mock does not establish the corresponding native implementation.
- Match test-library versions to the selected SDK/React renderer. Keep route-discovered files free of test files when using Expo Router.
- Exercise supported permissions, background/foreground transitions, offline/reconnect, updates and storage recovery in the relevant native build. A browser harness remains useful for the portable subset.
- Compare cold and warm startup, JS/UI thread stalls, sustained interactions and retained memory on representative release devices. Record thermal/power state, data volume and refresh rate; do not infer device throughput from emulator speed.
- Identify whether a failure is in JavaScript, native code or their boundary before selecting diagnostics. JS stacks and heap measurements do not cover native crashes, UI-thread work or total process memory.

### Device connection and artifact identity

- Distinguish the browser harness, Metro, the installed native binary and the application's API endpoint. A reachable web page does not establish that the native client uses the intended bundle or backend.
- Select a reachable LAN, local forwarding or supported tunnel path for the actual host/device arrangement. Device-local addresses refer to the device; a development-server tunnel does not automatically expose the API.
- Diagnose address advertisement, firewall reachability, binary/runtime compatibility and app permissions separately. Do not disable transport or authorization checks to mask a connection problem.
- Record application ID, build/profile and update runtime/channel when comparing behavior. A stale installed binary or incompatible update is not proof of a defect in the newly edited source.
- Use a release artifact for end-to-end production behavior; a development client needs its intended development bundle. Browser display size emulation does not become Android/iOS execution.

### Artifact qualification

- Android debugOptimized optimizes native C++ while retaining a development build; its debugging limitations and development overhead remain. It is useful for iteration, not a substitute for a signed release performance baseline.
- For Android instrumentation, a non-debuggable, profileable benchmark variant can retain release optimizations while using local test signing. Its configuration and workload must match the production question; signing identity alone does not determine optimization mode.
- Distinguish successful local release compilation from store-ready signing and distribution. Confirm the artifact profile, application identity and authorized signing route; do not infer store readiness from the word release.

### Runtime compatibility decisions

- A runtime-version match is only as sound as its derivation policy. appVersion depends on deliberate version changes; fingerprint derives identity from selected native inputs. Neither a matching channel nor a JavaScript-only test proves native compatibility.
- SDK 58's balanced fingerprint preset hashes native modules by package identity/version rather than every package file. Locally patched native code under an unchanged package version needs an appropriate hashing policy or deliberate runtime revision; do not infer compatibility from an unchanged hash alone.
- Exercise an update against an installed compatible preview/release binary, including cold offline start and persisted-state compatibility when affected. A bundle loading in Metro establishes a different path from the installed update runtime.

## Proof

Cover affected states and native capabilities on representative targets where required. Interpret performance with device, OS, runtime mode and workload in context; a web-only result does not establish native behavior.

## Sources

[Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/) · [Update signing](https://docs.expo.dev/eas-update/code-signing/) · [List tuning](https://reactnative.dev/docs/optimizing-flatlist-configuration).

[SDK matrix](https://docs.expo.dev/versions/latest/) · [New Architecture](https://docs.expo.dev/guides/new-architecture/) · [Hermes](https://reactnative.dev/docs/hermes) · [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).

[Development builds](https://docs.expo.dev/develop/development-builds/introduction/) · [Local app development](https://docs.expo.dev/guides/local-app-development/) · [APK artifacts](https://docs.expo.dev/build-reference/apk/) · [EAS local host support](https://docs.expo.dev/build-reference/local-builds/) · [Development modes](https://docs.expo.dev/workflow/development-mode/) · [Unit testing](https://docs.expo.dev/develop/unit-testing/) · [Router testing](https://docs.expo.dev/router/reference/testing/) · [Native performance](https://reactnative.dev/docs/performance).

[Update recovery limits](https://docs.expo.dev/eas-update/error-recovery/) · [Debugging boundaries](https://docs.expo.dev/debugging/tools/).

[Development connection modes](https://docs.expo.dev/develop/development-builds/development-workflows/) · [Expo CLI connections](https://docs.expo.dev/more/expo-cli/) · [Current SDK development changes](https://expo.dev/changelog/sdk-58).

[Android variants](https://docs.expo.dev/more/expo-cli/#compiling-android) · [Release qualification](https://docs.expo.dev/guides/local-app-production/).

[Android release-like measurement](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview).

[Fingerprint inputs](https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/).

## Routing

Continue through [languages](../../lang/index.md) with TypeScript. A reading route grants no code import.
