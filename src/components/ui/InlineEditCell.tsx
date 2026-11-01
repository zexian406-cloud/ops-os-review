import { useEffect, useRef, useState } from "react";

/**
 * 双击编辑的数字单元格（Inline Edit）。
 * - 非编辑态：纯文本展示（可带后缀），hover 高亮提示可编辑
 * - 双击进入编辑态：number input，自动聚焦全选
 * - Enter / 失焦提交，Esc 取消恢复原值
 *
 * 目的：安全库存、交期等中高频字段直接在表格内修改并保存，减少导出→改→再导入的循环。
 */
export default function InlineEditCell({
  value,
  onCommit,
  placeholder = "—",
  step = "1",
  suffix,
  className = "",
  inputClassName = "",
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  placeholder?: string;
  step?: string;
  suffix?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setLocal(value != null ? String(value) : "");
      // 等输入框挂载后聚焦并全选
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === "") {
      onCommit(undefined);
    } else {
      const n = Number(trimmed);
      if (!Number.isNaN(n) && n !== value) onCommit(n);
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step={step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        className={`w-20 rounded border border-blue-500/60 bg-background px-1.5 py-0.5 text-xs text-foreground outline-none ring-1 ring-blue-500/40 ${inputClassName}`}
      />
    );
  }

  return (
    <span
      title="双击编辑"
      onDoubleClick={() => setEditing(true)}
      className={`inline-block min-w-10 cursor-text rounded px-1.5 py-0.5 text-xs text-foreground-secondary transition-colors hover:bg-blue-500/10 hover:ring-1 hover:ring-blue-500/30 ${className}`}
    >
      {value != null && value !== 0 ? value : <span className="text-foreground-400">{placeholder}</span>}
      {suffix ? <span className="ml-0.5 text-foreground-400">{suffix}</span> : null}
    </span>
  );
}
