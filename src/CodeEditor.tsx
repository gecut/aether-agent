import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === "typescript" || label === "javascript"
      ? new TypeScriptWorker()
      : label === "json"
        ? new JsonWorker()
        : ["css", "scss", "less"].includes(label)
          ? new CssWorker()
          : ["html", "handlebars", "razor"].includes(label)
            ? new HtmlWorker()
            : new EditorWorker(),
};
const languages: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  html: "html",
  md: "markdown",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  txt: "plaintext",
};

export default function CodeEditor({
  file,
  content,
  theme,
  onChange,
  onSave,
}: {
  file: string;
  content: string;
  theme: "light" | "dark";
  onChange: (content: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(
    undefined,
  );
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  useEffect(() => {
    const model = monaco.editor.createModel(
      content,
      languages[file.split(".").pop() ?? ""] ?? "plaintext",
    );
    const editor = monaco.editor.create(host.current!, {
      model,
      theme: theme === "light" ? "vs" : "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 22,
      padding: { top: 18, bottom: 18 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      wordWrap: "on",
      accessibilitySupport: "on",
      ariaLabel: `Editor ${file}`,
      fixedOverflowWidgets: true,
    });
    instance.current = editor;
    const change = model.onDidChangeContent(() =>
      callbacks.current.onChange(model.getValue()),
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      callbacks.current.onSave(),
    );
    return () => {
      change.dispose();
      editor.dispose();
      model.dispose();
      instance.current = undefined;
    };
  }, [file]);
  useEffect(() => {
    if (instance.current && instance.current.getValue() !== content)
      instance.current.setValue(content);
  }, [content]);
  useEffect(() => {
    monaco.editor.setTheme(theme === "light" ? "vs" : "vs-dark");
  }, [theme]);
  return <div ref={host} className="monaco-host" />;
}
