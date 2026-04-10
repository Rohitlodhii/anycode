"use client";

import {
  ArrowRight,
  Atom,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Feather,
  Paperclip,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

interface AIModelOption {
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface AIPromptProps {
  className?: string;
  disabled?: boolean;
  footerControls?: ReactNode;
  isSubmitting?: boolean;
  modelPickerOpen?: boolean;
  models?: AIModelOption[];
  onModelPickerOpenChange?: (open: boolean) => void;
  onModelChange?: (model: string) => void;
  onSubmit?: (payload: { message: string; model: string; attachments?: string[] }) => void;
  onValueChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  selectedModel?: string;
  /** Controlled value; when provided the component becomes semi-controlled */
  value?: string;
  /** Ref forwarded to the wrapper div for anchor positioning */
  wrapperRef?: React.RefObject<HTMLDivElement | null>;
}

const DEFAULT_MODELS: AIModelOption[] = [
  {
    icon: <Bot className="size-4" />,
    label: "o3-mini",
  },
  {
    icon: <Atom className="size-4" />,
    label: "Gemini 2.5 Flash",
  },
  {
    icon: <Feather className="size-4" />,
    label: "Claude 3.5 Sonnet",
  },
  {
    icon: <Brain className="size-4" />,
    label: "GPT-4-1 Mini",
  },
  {
    icon: <Brain className="size-4" />,
    label: "GPT-4-1",
  },
];

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;

      const nextHeight = Math.max(
        minHeight,
        Math.min(
          textarea.scrollHeight,
          maxHeight ?? Number.POSITIVE_INFINITY
        )
      );

      textarea.style.height = `${nextHeight}px`;
    },
    [maxHeight, minHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { adjustHeight, textareaRef };
}

export function AI_Prompt({
  className,
  disabled = false,
  footerControls,
  isSubmitting = false,
  modelPickerOpen,
  models = DEFAULT_MODELS,
  onModelPickerOpenChange,
  onModelChange,
  onSubmit,
  onValueChange,
  onKeyDown: onKeyDownProp,
  placeholder = "What can I do for you?",
  selectedModel,
  value: controlledValue,
  wrapperRef,
}: AIPromptProps) {
  const [value, setValue] = useState(controlledValue ?? "");
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when controlled value changes externally (e.g. skill injection)
  useEffect(() => {
    if (controlledValue !== undefined) {
      setValue(controlledValue);
      adjustHeight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledValue]);
  const [internalSelectedModel, setInternalSelectedModel] = useState(
    models[0]?.label ?? "o3-mini"
  );
  const activeModel = selectedModel ?? internalSelectedModel;
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 72,
    maxHeight: 300,
  });
  const selectedModelOption = useMemo(
    () => models.find((model) => model.label === activeModel) ?? models[0],
    [activeModel, models]
  );

  const updateSelectedModel = useCallback(
    (model: string) => {
      if (!selectedModel) {
        setInternalSelectedModel(model);
      }
      onModelChange?.(model);
    },
    [onModelChange, selectedModel]
  );

  const submitPrompt = useCallback(() => {
    const message = value.trim();
    if (!message || disabled || isSubmitting) {
      return;
    }

    onSubmit?.({
      message,
      model: activeModel,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    });
    setValue("");
    setAttachments([]);
    adjustHeight(true);
    onValueChange?.("");
  }, [activeModel, adjustHeight, attachments, disabled, isSubmitting, onSubmit, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Let external handler (e.g. slash command navigation) intercept first
    onKeyDownProp?.(event);
    if (event.defaultPrevented) return;

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      value.trim() &&
      !disabled &&
      !isSubmitting
    ) {
      event.preventDefault();
      submitPrompt();
    }
  };

  return (
    <div ref={wrapperRef} className={cn("w-full max-w-3xl py-4", className)}>
      <div className="rounded-[1.4rem] border border-border/70 bg-gradient-to-b from-background via-background to-muted/30 p-1.5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.65)]">
        <div className="relative overflow-hidden rounded-[1.1rem] border border-border/60 bg-background/70 backdrop-blur">
          <div className="relative flex flex-col">
            <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
              <Textarea
                className={cn(
                  "min-h-[72px] w-full rounded-none border-0 bg-transparent px-4 py-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none"
                )}
                disabled={disabled}
                id="animated-ai-input"
                onChange={(event) => {
                  setValue(event.target.value);
                  adjustHeight();
                  onValueChange?.(event.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                ref={textareaRef}
                value={value}
              />
            </div>

            <div className="flex h-14 items-center border-t border-border/60 bg-muted/20">
              <div className="absolute right-3 bottom-3 left-3 flex items-center justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <DropdownMenu
                    open={modelPickerOpen}
                    onOpenChange={onModelPickerOpenChange}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-8 gap-1 rounded-md pl-2 pr-2 text-xs"
                        type="button"
                        variant="ghost"
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-1.5"
                            exit={{ opacity: 0, y: 5 }}
                            initial={{ opacity: 0, y: -5 }}
                            key={activeModel}
                            transition={{ duration: 0.15 }}
                          >
                            {selectedModelOption?.icon ?? (
                              <Bot className="size-4" />
                            )}
                            <span>{activeModel}</span>
                            <ChevronDown className="size-3 opacity-50" />
                          </motion.div>
                        </AnimatePresence>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="min-w-[13rem] border-border/70 bg-popover/95 backdrop-blur"
                    >
                      {models.map((model) => (
                        <DropdownMenuItem
                          className="flex items-center justify-between gap-2"
                          key={model.label}
                          onSelect={() => updateSelectedModel(model.label)}
                        >
                          <div className="flex items-center gap-2">
                            {model.icon ?? <Bot className="size-4" />}
                            <div className="flex flex-col">
                              <span>{model.label}</span>
                              {model.description ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {model.description}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {activeModel === model.label ? (
                            <Check className="size-4 text-primary" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <div className="mx-0.5 h-4 w-px bg-border" />

                  <label
                    aria-label="Attach file"
                    className={cn(
                      "cursor-pointer rounded-lg border border-transparent p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <input
                      className="hidden"
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt,.md,.csv,.json"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        const paths = files
                          .map((f) => (f as File & { path?: string }).path)
                          .filter((p): p is string => Boolean(p));
                        if (paths.length > 0) {
                          setAttachments((prev) => [...prev, ...paths]);
                        }
                        // reset so same file can be re-selected
                        e.target.value = "";
                      }}
                    />
                    <Paperclip className="size-4" />
                  </label>

                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {attachments.map((p, i) => (
                        <span
                          key={p}
                          className="flex items-center gap-1 rounded-md border border-border/60 bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {p.split(/[\\/]/).pop()}
                          <button
                            type="button"
                            aria-label={`Remove ${p}`}
                            className="ml-0.5 hover:text-foreground"
                            onClick={() =>
                              setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {footerControls ? (
                    <>
                      <div className="mx-0.5 h-4 w-px bg-border" />
                      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                        {footerControls}
                      </div>
                    </>
                  ) : null}
                </div>

                <button
                  aria-label="Send message"
                  className={cn(
                    "rounded-lg border border-transparent bg-primary/10 p-2 transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    (!value.trim() || disabled || isSubmitting) &&
                      "cursor-not-allowed opacity-50"
                  )}
                  disabled={!value.trim() || disabled || isSubmitting}
                  onClick={submitPrompt}
                  type="button"
                >
                  <ArrowRight className="size-4 text-foreground" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
