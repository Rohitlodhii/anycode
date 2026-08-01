import { useRef, useState, useCallback, useEffect } from "react";
import type { RefObject } from "react";
import type { ContentChangeEvent, KeyEvent } from "@opentui/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import { getFilteredCommands } from "./filter-commands";
import type { Command } from "./commandtypes";

export function useCommandMenu(textareaRef: RefObject<any | null>, onExit?: () => void) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [show, setShow] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  const filteredRef = useRef<Command[]>([]);
  const showRef = useRef(false);
  const selectedIndexRef = useRef(0);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  showRef.current = show;
  selectedIndexRef.current = selectedIndex;

  const filtered = getFilteredCommands(query);
  filteredRef.current = filtered;

  useEffect(() => {
    const count = filteredRef.current.length;
    setSelectedIndex(Math.max(0, count - 1));
    const el = scrollRef.current;
    if (el) {
      const viewportHeight = (el as any).viewport?.height ?? 0;
      const maxScroll = Math.max(0, (el as any).scrollHeight - viewportHeight);
      el.scrollTo(maxScroll);
    }
  }, [query]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !show) return;
    const viewportHeight = (el as any).viewport?.height ?? 0;
    const maxScroll = Math.max(0, (el as any).scrollHeight - viewportHeight);
    const current = Math.min((el as any).scrollTop ?? 0, maxScroll);

    let target = current;
    if (selectedIndex < current) {
      target = selectedIndex;
    } else if (selectedIndex >= current + viewportHeight) {
      target = selectedIndex - viewportHeight + 1;
    }
    el.scrollTo(Math.max(0, Math.min(target, maxScroll)));
  }, [selectedIndex, show]);

  const updateFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      setShow(false);
      return;
    }
    const text = el.plainText ?? "";
    const offset = el.cursorOffset ?? text.length;
    const before = text.slice(0, offset);
    const slashIdx = before.lastIndexOf("/");

    if (
      slashIdx !== -1 &&
      (slashIdx === 0 ||
        before[slashIdx - 1] === " " ||
        before[slashIdx - 1] === "\n")
    ) {
      const cmdText = before.slice(slashIdx + 1);
      if (!cmdText.includes(" ")) {
        setQuery(cmdText);
        setShow(true);
        return;
      }
    }

    setShow(false);
    setQuery("");
  }, [textareaRef]);

  const onContentChange = useCallback(
    (_event: ContentChangeEvent) => {
      updateFromTextarea();
    },
    [updateFromTextarea],
  );

  const onCursorChange = useCallback(() => {
    updateFromTextarea();
  }, [updateFromTextarea]);

  const onSelect = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const executeCommand = useCallback(
    (cmd: Command) => {
      const el = textareaRef.current;
      if (!el) return;

      const text = el.plainText ?? "";
      const offset = el.cursorOffset ?? text.length;
      const before = text.slice(0, offset);
      const slashIdx = before.lastIndexOf("/");

      if (slashIdx !== -1) {
        const prefix = text.slice(0, slashIdx);
        const suffix = text.slice(offset);

        if (cmd.action) {
          el.setText(prefix + suffix);
          el.cursorOffset = slashIdx;
          cmd.action({ exit: () => onExitRef.current?.() });
        } else {
          el.setText(prefix + cmd.value + " " + suffix);
          el.cursorOffset = slashIdx + cmd.value.length + 1;
        }
      }

      setShow(false);
    },
    [textareaRef],
  );

  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  const onExecute = useCallback(
    (index: number) => {
      const cmd = filteredRef.current[index];
      if (!cmd) return;
      executeCommand(cmd);
    },
    [executeCommand],
  );

  const onKeyDown = useCallback((key: KeyEvent) => {
    if (!showRef.current) return;

    if (key.name === "ArrowUp" || key.name === "up") {
      key.preventDefault();
      const list = filteredRef.current;
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1));
    } else if (key.name === "ArrowDown" || key.name === "down") {
      key.preventDefault();
      const list = filteredRef.current;
      setSelectedIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0));
    } else if (
      key.name === "Enter" || key.name === "enter" ||
      key.name === "Return" || key.name === "return" ||
      key.name === "Tab" || key.name === "tab"
    ) {
      key.preventDefault();
      const cmd = filteredRef.current[selectedIndexRef.current];
      if (cmd) executeCommandRef.current(cmd);
    } else if (key.name === "Escape" || key.name === "escape") {
      key.preventDefault();
      setShow(false);
    }
  }, []);

  return {
    query,
    show,
    selectedIndex,
    scrollRef,
    filtered,
    onContentChange,
    onCursorChange,
    onSelect,
    onExecute,
    onKeyDown,
  };
}
