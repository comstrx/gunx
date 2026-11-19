# Electrobun

## Contract

Own Electrobun host/view integration, RPC, SDK preparation, packaging and updates. The desktop part owns application composition and capability policy; the engine owns portable mechanisms.

## Structure

The runtime owns its host, view, contract, SDK preparation, packaging and tests; the page uses one bridge.

## Rules

- Implement the desktop part's host contract through Electrobun RPC; static RPC types do not validate received values.
- Configure BrowserView isolation, navigation and content policy to satisfy the desktop part's capability boundary.
- Bind product window and update configuration to Electrobun packaging without creating a second identity owner.
- Resolve SDK and paired tooling at their pinned versions. Verify the installed version rather than assuming main-branch docs match it.
- System webviews and CEF differ. Check applicable OS and renderer behavior; WSLg is a smoke environment, not native Windows or macOS performance evidence.

### Host lifecycle

- Host RPC handlers validate received types, lengths and permitted URLs/paths before invoking privileged capabilities.
- Apply the desktop part’s visibility/readiness contract through the actual BrowserView lifecycle; this library does not select product window policy.
- `executeJavascript` is neither a return-value RPC nor a document-readiness barrier. Use the supported readiness event/handshake before document-dependent work and typed RPC for returned data.
- Upstream says removing a view disconnects its RPC; verify installed release and renderer. Unsubscribe listeners and settle pending operations during teardown.

### Privilege and memory

- Apply the desktop part's document-scoped grant contract to the actual view/RPC lifecycle.
- Origin allowlists, CSP and typed RPC complement host authorization; none replaces explicit capability checks.
- Host replies expose the minimum data. Bound pending calls and stream chunks; window disposal must settle callbacks and release retained view references.
- A lexical normalized path is not safe against concurrent symlink replacement. Use rooted handle-based resolution or an equivalently proven platform boundary for hostile filesystem access.
- Compare renderer process trees and native allocations during repeated open/close and navigation. Heap snapshots alone miss webview/native memory.

### Build, run and platform matrix

- Resolve the installed release's build contract before applying current documentation. Electrobun 2.x uses Hutch with paired devkit/toolchain selection; upgrading that architecture is a dependency change, not a routine launch step.
- In that contract, dev builds create a runnable development bundle; canary/stable builds produce optimized distribution artifacts and update metadata. Running an existing bundle and rebuilding it are separate operations.
- Current Hutch builds target the host OS and architecture, not arbitrary cross-compilation. Plan native Linux, macOS and Windows build coverage for the intended artifacts.
- Resolve each platform's system-webview dependencies and the optional CEF choice. Browser content working on one renderer does not establish another renderer's behavior.
- In the current 2.x build contract, Linux native wrappers still need GTK/WebKitGTK and related host libraries with CEF enabled. Bundling a renderer does not remove every native dependency; validate the intended distribution baseline.
- Check GUI/display availability separately from successful compilation. Headless contract tests and WSLg launches do not prove native installation, focus, tray, menus, notifications or updates.
- Apply the configured signing/notarization and update channel to the actual installer. Never infer release readiness from a development window.

### Testing and profiling

- Test the bridge contract without host privileges, then exercise real host handlers, rejected capabilities, navigation and disposed views through the native application.
- Separate main-process, renderer and whole-process-tree costs. Compare dev/release modes, webview/CEF, startup and repeated window cycles without changing the feature set.
- Include installer upgrade, absent/corrupted update, rollback policy and retained user data when the task concerns distribution. Use the affected platform's artifact, not an unrelated host build.

### Embedded content and packaging boundaries

- Configure untrusted embedded views with the installed release's sandbox and navigation controls. Inspect which host events/bridges remain available; sandbox is not a promise of total isolation.
- Route navigation, new windows and external protocols through explicit policy. A validated initial URL does not authorize every later destination.
- Treat webview partitions, storage and session lifetime as configured behavior; cover identity changes and window reuse rather than assuming close always removes data.
- Keep devkit projection and generated packaging output separate from maintained source. Rebuilding can refresh generated files; handwritten changes belong in their declared configuration or source owner.
- In releases exposing host queue statistics, queued bytes describe serialized payload, not retained heap; drained messages do not acknowledge view delivery. Those diagnostics do not impose a queue limit.
- Treat `allowedProtocols.appData` as a filesystem-read grant that can survive navigation to remote content. Keep grants consistent with the document’s trust boundary, not merely its initial URL.

### Update artifacts and completion

- An update bundle hash identifies a release path; it is not code-signing authentication. Preserve HTTPS and the required platform-signing contract. Installation, downloaded-byte verification and authenticated publisher identity are distinct claims.
- Delta updates may traverse several retained patches and fall back to a full archive. Budget staging space and interruption recovery for both paths; a small patch does not establish a small worst-case download or installation footprint.
- Preserve installed channel, OS and architecture identity when selecting artifacts. The updater follows the installed architecture; changing an x64 installation to ARM64 requires a supported explicit installation path.

## Proof

Typecheck and test the contract, malformed input, unavailable host and handler coverage. Launch the actual affected window; exercise close/reopen and failure. Verify installer and update behavior on affected platforms.

## Sources

[Current official docs](https://docs.electrobun.dev/electrobun/) · [Rooted Linux resolution](https://man7.org/linux/man-pages/man2/openat2.2.html).

[BrowserView](https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/browser-view.mdx) · [Releases](https://github.com/blackboardsh/electrobun/releases) · [Channels](https://github.com/blackboardsh/electrobun/blob/main/BETA_RELEASE.md).

[Build environments and host targets](https://docs.electrobun.dev/electrobun/apis/cli/cli-args/) · [Paired tooling](https://docs.electrobun.dev/electrobun/guides/hutch/) · [Platform support](https://docs.electrobun.dev/electrobun/guides/cross-platform-development/).

[Webview sandbox limits](https://docs.electrobun.dev/electrobun/guides/architecture/webview-tag/) · [Project/build ownership](https://docs.electrobun.dev/electrobun/guides/architecture/overview/).

[Update protocol and fallback](https://framework.blackboard.sh/electrobun/guides/updates/).

[Platform packaging](https://framework.blackboard.sh/electrobun/guides/bundling-and-distribution/).

## Routing

Continue through [languages](../../lang/index.md) with TypeScript. A reading route grants no code import.
