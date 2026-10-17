# Editor and restoration

Aether uses Monaco Editor 0.57.0, Microsoft's standalone editor generated from VS Code revision `6a598d4a13031703d483d103c1d934a36ad27971`. It loads locally when opening a file, including local editor/TypeScript/JSON workers. No remote editor scripts or renderer Node access are enabled. Search, folding, syntax highlighting, completion and Ctrl/Cmd S operate in the embedded editor. Extension installation/execution still uses the explicit external VS Code handoff; Aether does not bundle the full workbench or extension host.

The file explorer supports filtering and remembered collapse controls. Sensitive paths, escaping symlinks, binary files and files over 200,000 characters are rejected. Reads for editing preserve exact content rather than saving a redacted preview over the original file. Each save supplies the content revision it read; mismatches block stale overwrites.

Private application records retain the previous content before each save, bounded to 20 snapshots per project. File history offers restoration with confirmation, preserves the current saved content as another snapshot, and checks the current revision. These snapshots stay in application data, never in the project repository or provider context. Older saves made before this feature have no snapshot.

Newly applied agent sessions persist version-1 application evidence: baseline HEAD, changed paths, content fingerprint and application time. “Restore previous version” reverses that session's patch only after the current HEAD and all affected file contents still match the recorded evidence. Affected files with newer changes block restoration. Unrelated files remain intact. This does not reset Git history or force-push; the session retains its original execution and restore events. Historical sessions without application evidence do not expose restore.

UI menus are portaled to a viewport-bounded fixed overlay and close on outside click or Escape. Dialogs use a higher layer and notifications stay readable above dialogs. Native title tooltips remain available for icon actions. Navigation, activity, explorer and inspector section preferences use versioned local-storage keys.
