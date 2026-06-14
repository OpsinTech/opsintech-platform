"use client";

import type { ChatStatus } from "ai";
import {
  CheckIcon,
  Download,
  FileJson,
  FileText,
  GraduationCapIcon,
  LightbulbIcon,
  PaperclipIcon,
  PlusIcon,
  RocketIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchAuthApi } from "@/core/api/auth-client";
import { getBackendBaseURL } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";
import { useAvailableModels } from "@/core/models/hooks";
import type { AvailableSkillResponse } from "@/core/skills/type";
import type { AgentThreadContext } from "@/core/threads";
import {
  exportThreadAsJSON,
  exportThreadAsMarkdown,
} from "@/core/threads/export";
import type { AgentThread } from "@/core/threads/types";
import { textOfMessage } from "@/core/threads/utils";
import { cn } from "@/lib/utils";

import { Suggestion, Suggestions } from "../ai-elements/suggestion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import {
  SkillSettingsPanel,
  DEFAULT_SKILL_SETTINGS,
  type SkillSettings,
} from "./chats";
import { useThread } from "./messages/context";
import { ModeHoverGuide } from "./mode-hover-guide";
import { SkillBadge } from "./skill-badge";
import { SkillCommandMenu } from "./skill-command-menu";
import { Tooltip } from "./tooltip";

type InputMode = "flash" | "thinking" | "pro" | "ultra";

function getResolvedMode(
  mode: InputMode | undefined,
  supportsThinking: boolean,
): InputMode {
  if (!supportsThinking && mode !== "flash") {
    return "flash";
  }
  if (mode) {
    return mode;
  }
  return supportsThinking ? "pro" : "flash";
}

function formatPromptWithSkillSettings(
  text: string,
  skillName: string,
  settings: SkillSettings,
): string {
  let systemContext = "";
  if (skillName === "ppt-master" && settings["ppt-master"]) {
    const ppt = settings["ppt-master"];
    let templatePath = "";
    if (ppt.templatePptx) {
      templatePath = `\n- template_pptx: ${ppt.templatePptx}`;
    } else if (ppt.template && ppt.template !== "free") {
      if (ppt.template.includes("/") || ppt.template.includes("\\")) {
        templatePath = `\n- template_path: ${ppt.template}`;
      } else {
        templatePath = `\n- template_path: skills/public/ppt-master/templates/layouts/${ppt.template}`;
      }
    }
    const aspect = ppt.aspectRatio === "16:9" 
      ? "ppt169" 
      : (ppt.aspectRatio === "4:3" ? "ppt43" : ppt.aspectRatio);
    const industryContext = ppt.industry && ppt.industry !== "none" ? `\n- industry: ${ppt.industry}` : "";
    const imageModelContext = ppt.imageModel && ppt.imageModel !== "none" ? `\n- image_model: ${ppt.imageModel}` : "";
    systemContext = `[SYSTEM CONTEXT: ppt-master]
- style: ${ppt.style}
- aspect_ratio: ${aspect}
- pages: ${ppt.pages}${templatePath}${industryContext}${imageModelContext}
- transition: ${ppt.transition || "fade"}
- animation: ${ppt.animation || "auto"}
- formula: ${ppt.formula || "mixed"}
- merge_paragraphs: ${!!ppt.mergeParagraphs}`;
  } else if (skillName === "deep-research" && settings["deep-research"]) {
    const res = settings["deep-research"];
    systemContext = `[SYSTEM CONTEXT: deep-research]
- depth: ${res.depth}
- time_range: ${res.timeRange}
- sources: ${res.sources.join(", ")}`;
  } else if (skillName === "data-analysis" && settings["data-analysis"]) {
    const da = settings["data-analysis"];
    systemContext = `[SYSTEM CONTEXT: data-analysis]
- preference: ${da.preference}
- output_format: ${da.outputFormat}`;
  } else if (skillName === "chart-visualization" && settings["chart-visualization"]) {
    const cv = settings["chart-visualization"];
    systemContext = `[SYSTEM CONTEXT: chart-visualization]
- chart_type: ${cv.chartType}
- color_theme: ${cv.colorTheme}`;
  } else if (skillName === "consulting-analysis" && settings["consulting-analysis"]) {
    const ca = settings["consulting-analysis"];
    const frameworkMap: Record<string, string> = {
      SWOT: "SWOT",
      PESTEL: "PESTEL",
      porter: "Porter's Five Forces",
      bcg: "BCG Matrix",
      "3c": "3C Model",
    };
    const mappedFrameworks = ca.frameworks.map((f) => frameworkMap[f] || f);
    systemContext = `[SYSTEM CONTEXT: consulting-analysis]
- report_type: ${ca.reportType}
- frameworks: ${mappedFrameworks.join(", ")}
- language: ${ca.language}`;
  } else if (skillName === "pm-analysis" && settings["pm-analysis"]) {
    const pm = settings["pm-analysis"];
    systemContext = `[SYSTEM CONTEXT: pm-analysis]
- analysis_mode: ${pm.mode}
- primary_framework: ${pm.framework}
- prd_template: ${pm.template}`;
  }

  if (systemContext) {
    return `${systemContext}\n\n[USER QUERY]\n${text}`;
  }
  return text;
}

export function InputBox({
  className,
  disabled,
  autoFocus,
  status = "ready",
  context,
  extraHeader,
  isNewThread,
  threadId,
  initialValue,
  onContextChange,
  onSubmit,
  onStop,
  onNewChat,
  ...props
}: Omit<ComponentProps<typeof PromptInput>, "onSubmit"> & {
  assistantId?: string | null;
  status?: ChatStatus;
  disabled?: boolean;
  context: Omit<
    AgentThreadContext,
    "thread_id" | "is_plan_mode" | "thinking_enabled" | "subagent_enabled"
  > & {
    mode: "flash" | "thinking" | "pro" | "ultra" | undefined;
    reasoning_effort?: "minimal" | "low" | "medium" | "high";
    skill_name?: string;
  };
  extraHeader?: React.ReactNode;
  isNewThread?: boolean;
  threadId: string;
  initialValue?: string;
  onContextChange?: (
    context: Omit<
      AgentThreadContext,
      "thread_id" | "is_plan_mode" | "thinking_enabled" | "subagent_enabled"
    > & {
      mode: "flash" | "thinking" | "pro" | "ultra" | undefined;
      reasoning_effort?: "minimal" | "low" | "medium" | "high";
      skill_name?: string;
    },
  ) => void;
  onSubmit?: (message: PromptInputMessage) => void;
  onStop?: () => void;
  onNewChat?: () => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [skillSettings, setSkillSettings] = useState<SkillSettings>(DEFAULT_SKILL_SETTINGS);
  const searchParams = useSearchParams();
  const { models: availableModels } = useAvailableModels();
  const models = useMemo(() => {
    const seen = new Set<string>();
    return availableModels.filter((model) => {
      if (
        !model?.name
        || model.scope !== "tenant"
        || seen.has(model.name)
        || model.enabled === false
      ) {
        return false;
      }
      seen.add(model.name);
      return true;
    });
  }, [availableModels]);
  const inputDisabled = (disabled ?? false) || models.length === 0;
  const { thread, isMock } = useThread();
  const { textInput } = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const promptRootRef = useRef<HTMLDivElement | null>(null);

  const [followups, setFollowups] = useState<string[]>([]);
  const [followupsHidden, setFollowupsHidden] = useState(false);
  const [followupsLoading, setFollowupsLoading] = useState(false);
  const lastGeneratedForAiIdRef = useRef<string | null>(null);
  const wasStreamingRef = useRef(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(
    null,
  );

  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillMenuSearch, setSkillMenuSearch] = useState("");
  const [skillMenuPosition, setSkillMenuPosition] = useState({ top: 0, left: 0, width: 280 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const slashStartPosRef = useRef<number | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  useEffect(() => {
    if (models.length === 0) {
      return;
    }
    const currentModel = models.find((m) => m.name === context.model_name);
    const fallbackModel = currentModel ?? models[0]!;
    const supportsThinking = fallbackModel.supports_thinking ?? false;
    const nextModelName = fallbackModel.name;
    const nextMode = getResolvedMode(context.mode, supportsThinking);

    if (context.model_name === nextModelName && context.mode === nextMode) {
      return;
    }

    onContextChange?.({
      ...context,
      model_name: nextModelName,
      mode: nextMode,
    });
  }, [context, models, onContextChange]);

  const selectedModel = useMemo(() => {
    if (models.length === 0) {
      return undefined;
    }
    return models.find((m) => m.name === context.model_name) ?? models[0];
  }, [context.model_name, models]);

  const supportThinking = useMemo(
    () => selectedModel?.supports_thinking ?? false,
    [selectedModel],
  );

  const supportReasoningEffort = useMemo(() => {
    if (!selectedModel) {
      return false;
    }
    // Some endpoints omit supports_reasoning_effort. Fall back to supports_thinking.
    return selectedModel.supports_reasoning_effort ?? selectedModel.supports_thinking ?? false;
  }, [selectedModel]);

  const handleModeSelect = useCallback(
    (mode: InputMode) => {
      onContextChange?.({
        ...context,
        mode: getResolvedMode(mode, supportThinking),
        reasoning_effort: mode === "ultra" ? "high" : mode === "pro" ? "medium" : mode === "thinking" ? "low" : "minimal",
      });
    },
    [onContextChange, context, supportThinking],
  );

  const handleReasoningEffortSelect = useCallback(
    (effort: "minimal" | "low" | "medium" | "high") => {
      onContextChange?.({
        ...context,
        reasoning_effort: effort,
      });
    },
    [onContextChange, context],
  );

  const isStreaming = status === "streaming";
  const submitDisabled = inputDisabled || isStreaming;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (isStreaming) {
        return;
      }
      if (models.length === 0) {
        return;
      }
      const hasText = Boolean(message.text?.trim());
      const hasFiles = (message.files?.length ?? 0) > 0;
      if (!hasText && !hasFiles) {
        return;
      }
      setFollowups([]);
      setFollowupsHidden(false);
      setFollowupsLoading(false);

      const text = message.text || "";
      const formattedText = context.skill_name
        ? formatPromptWithSkillSettings(text, context.skill_name, skillSettings)
        : text;

      onSubmit?.({
        ...message,
        text: formattedText,
      });
    },
    [models.length, onSubmit, isStreaming, context.skill_name, skillSettings],
  );

  const handleExport = useCallback(
    (format: "markdown" | "json") => {
      if (thread.messages.length === 0) {
        toast.error(t.conversation.noMessages);
        return;
      }
      const agentThread = {
        thread_id: threadId,
        updated_at: new Date().toISOString(),
        values: thread.values,
      } as AgentThread;

      if (format === "markdown") {
        exportThreadAsMarkdown(agentThread, thread.messages);
      } else {
        exportThreadAsJSON(agentThread, thread.messages);
      }
      toast.success(t.common.exportSuccess);
    },
    [thread.messages, thread.values, threadId, t],
  );

  const requestFormSubmit = useCallback(() => {
    const form = promptRootRef.current?.querySelector("form");
    form?.requestSubmit();
  }, []);

  const handleFollowupClick = useCallback(
    (suggestion: string) => {
      if (status === "streaming") {
        return;
      }
      const current = (textInput.value ?? "").trim();
      if (current) {
        setPendingSuggestion(suggestion);
        setConfirmOpen(true);
        return;
      }
      textInput.setInput(suggestion);
      setFollowupsHidden(true);
      setTimeout(() => requestFormSubmit(), 0);
    },
    [requestFormSubmit, status, textInput],
  );

  const confirmReplaceAndSend = useCallback(() => {
    if (!pendingSuggestion) {
      setConfirmOpen(false);
      return;
    }
    textInput.setInput(pendingSuggestion);
    setFollowupsHidden(true);
    setConfirmOpen(false);
    setPendingSuggestion(null);
    setTimeout(() => requestFormSubmit(), 0);
  }, [pendingSuggestion, requestFormSubmit, textInput]);

  const confirmAppendAndSend = useCallback(() => {
    if (!pendingSuggestion) {
      setConfirmOpen(false);
      return;
    }
    const current = (textInput.value ?? "").trim();
    const next = current ? `${current}\n${pendingSuggestion}` : pendingSuggestion;
    textInput.setInput(next);
    setFollowupsHidden(true);
    setConfirmOpen(false);
    setPendingSuggestion(null);
    setTimeout(() => requestFormSubmit(), 0);
  }, [pendingSuggestion, requestFormSubmit, textInput]);

  const handleSkillSelect = useCallback(
    (skill: AvailableSkillResponse) => {
      onContextChange?.({
        ...context,
        skill_name: skill.name,
      });
      setSettingsPanelOpen(true);
      setSkillMenuOpen(false);
      setSkillMenuSearch("");
      slashStartPosRef.current = null;
    },
    [context, onContextChange],
  );

  const handleClearSkill = useCallback(
    () => {
      onContextChange?.({
        ...context,
        skill_name: undefined,
      });
      setSettingsPanelOpen(false);
    },
    [context, onContextChange],
  );

  const handleCloseSettingsPanel = useCallback(
    () => {
      setSettingsPanelOpen(false);
    },
    [],
  );

  const handleSkillMenuOpen = useCallback(
    () => {
      const textareaEl = document.querySelector<HTMLTextAreaElement>("textarea[name='message']");
      if (!textareaEl) return;
      const rect = textareaEl.getBoundingClientRect();
      const scrollTop = textareaEl.scrollTop;
      const lineHeight = 24;
      const lines = textareaEl.value.slice(0, textareaEl.selectionStart).split("\n");
      const currentLineIndex = lines.length - 1;
      const top = rect.top + (currentLineIndex * lineHeight) - scrollTop + lineHeight;
      setSkillMenuPosition({
        top: Math.min(top, window.innerHeight - 350),
        left: rect.left,
        width: Math.max(rect.width, 280),
      });
      setSkillMenuOpen(true);
    },
    [],
  );

  const handleSlashKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "/" && !skillMenuOpen) {
        const target = e.currentTarget;
        const slashPos = target.selectionStart;
        slashStartPosRef.current = slashPos;
        setSkillMenuSearch("");
        handleSkillMenuOpen();
        e.preventDefault();
      }
    },
    [skillMenuOpen, handleSkillMenuOpen],
  );

  useEffect(() => {
    if (!settingsPanelOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsPanelOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsPanelOpen]);

  useEffect(() => {
    const streaming = status === "streaming";
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming;
    if (!wasStreaming || streaming) {
      return;
    }

    if (inputDisabled || isMock) {
      return;
    }

    const lastAi = [...thread.messages].reverse().find((m) => m.type === "ai");
    const lastAiId = lastAi?.id ?? null;
    if (!lastAiId || lastAiId === lastGeneratedForAiIdRef.current) {
      return;
    }
    lastGeneratedForAiIdRef.current = lastAiId;

    const recent = thread.messages
      .filter((m) => m.type === "human" || m.type === "ai")
      .map((m) => {
        const role = m.type === "human" ? "user" : "assistant";
        const content = textOfMessage(m) ?? "";
        return { role, content };
      })
      .filter((m) => m.content.trim().length > 0)
      .slice(-6);

    if (recent.length === 0) {
      return;
    }

    const controller = new AbortController();
    setFollowupsHidden(false);
    setFollowupsLoading(true);
    setFollowups([]);

    fetchAuthApi(`/api/threads/${threadId}/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: recent,
        n: 3,
        model_name: context.model_name ?? undefined,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          return { suggestions: [] as string[] };
        }
        return (await res.json()) as { suggestions?: string[] };
      })
      .then((data) => {
        const suggestions = (data.suggestions ?? [])
          .map((s) => (typeof s === "string" ? s.trim() : ""))
          .filter((s) => s.length > 0)
          .slice(0, 5);
        setFollowups(suggestions);
      })
      .catch(() => {
        setFollowups([]);
      })
      .finally(() => {
        setFollowupsLoading(false);
      });

    return () => controller.abort();
  }, [context.model_name, inputDisabled, isMock, status, thread.messages, threadId]);

  return (
    <div ref={promptRootRef} className="relative">
      <PromptInput
        className={cn(
          "bg-background/85 rounded-2xl backdrop-blur-sm transition-all duration-300 ease-out overflow-hidden *:data-[slot='input-group']:rounded-2xl",
          className,
        )}
        disabled={submitDisabled}
        globalDrop
        multiple
        onSubmit={handleSubmit}
        {...props}
      >
        {extraHeader && (
          <div className="absolute top-0 right-0 left-0 z-10">
            <div className="absolute right-0 bottom-0 left-0 flex items-center justify-center">
              {extraHeader}
            </div>
          </div>
        )}
        <PromptInputAttachments>
          {(attachment) => <PromptInputAttachment data={attachment} />}
        </PromptInputAttachments>
        {context.skill_name && settingsPanelOpen && (
          <SkillSettingsPanel
            skillName={context.skill_name}
            settings={skillSettings}
            onChange={setSkillSettings}
            onClose={handleCloseSettingsPanel}
            locale={locale}
            threadId={threadId}
          />
        )}
        <PromptInputBody className="flex-row items-start gap-2 px-3 pt-3">
          {context.skill_name && !t.inputBox.suggestions.some(s => s.skillName === context.skill_name) && (
            <div className="shrink-0 pt-1">
              <SkillBadge
                skillName={context.skill_name}
                onRemove={handleClearSkill}
              />
            </div>
          )}
          <PromptInputTextarea
            className={cn("flex-1 min-w-0")}
            disabled={inputDisabled}
            placeholder={
              context.skill_name
                ? t.inputBox.placeholderWithSkill
                : t.inputBox.placeholder
            }
            autoFocus={autoFocus}
            defaultValue={initialValue}
            onKeyDown={(e) => {
              if (!skillMenuOpen) {
                handleSlashKeyDown(e);
              }
            }}
          />
        </PromptInputBody>
        <PromptInputFooter className="flex justify-between">
          <PromptInputTools>
            {/* + 按钮 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PromptInputButton className="px-2!">
                  <PlusIcon className="size-4" />
                </PromptInputButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => attachments.openFileDialog()}>
                    <PaperclipIcon className="size-4 mr-2" />
                    {t.inputBox.uploadFileOrImage}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {thread.messages.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="size-4 mr-2 text-muted-foreground" />
                          {t.common.export}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-48">
                          <DropdownMenuItem onClick={() => handleExport("markdown")}>
                            <FileText className="size-4 mr-2 text-muted-foreground" />
                            {t.common.exportAsMarkdown}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport("json")}>
                            <FileJson className="size-4 mr-2 text-muted-foreground" />
                            {t.common.exportAsJSON}
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 竖线分隔 */}
            <div className="bg-border h-4 w-px" />

            {/* 模式选择器 */}
            <PromptInputActionMenu>
              <ModeHoverGuide
                mode={
                  context.mode === "flash" ||
                    context.mode === "thinking" ||
                    context.mode === "pro" ||
                    context.mode === "ultra"
                    ? context.mode
                    : "flash"
                }
              >
                <PromptInputActionMenuTrigger className="gap-1! px-2!">
                  <div>
                  {context.mode === "flash" && <ZapIcon className="size-3" />}
                  {context.mode === "thinking" && (
                    <LightbulbIcon className="size-3" />
                  )}
                  {context.mode === "pro" && (
                    <GraduationCapIcon className="size-3" />
                  )}
                  {context.mode === "ultra" && (
                    <RocketIcon className="size-3 text-[#dabb5e]" />
                  )}
                </div>
                <div
                  className={cn(
                    "text-xs font-normal",
                    context.mode === "ultra" ? "golden-text" : "",
                  )}
                >
                  {(context.mode === "flash" && t.inputBox.flashMode) ||
                    (context.mode === "thinking" && t.inputBox.reasoningMode) ||
                    (context.mode === "pro" && t.inputBox.proMode) ||
                    (context.mode === "ultra" && t.inputBox.ultraMode)}
                </div>
              </PromptInputActionMenuTrigger>
            </ModeHoverGuide>
            <PromptInputActionMenuContent className="w-80">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  {t.inputBox.mode}
                </DropdownMenuLabel>
                <PromptInputActionMenu>
                  <PromptInputActionMenuItem
                    className={cn(
                      context.mode === "flash"
                        ? "text-accent-foreground"
                        : "text-muted-foreground/65",
                    )}
                    onSelect={() => handleModeSelect("flash")}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1 font-bold">
                        <ZapIcon
                          className={cn(
                            "mr-2 size-4",
                            context.mode === "flash" &&
                            "text-accent-foreground",
                          )}
                        />
                        {t.inputBox.flashMode}
                      </div>
                      <div className="pl-7 text-xs">
                        {t.inputBox.flashModeDescription}
                      </div>
                    </div>
                    {context.mode === "flash" ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </PromptInputActionMenuItem>
                  {supportThinking && (
                    <PromptInputActionMenuItem
                      className={cn(
                        context.mode === "thinking"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleModeSelect("thinking")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          <LightbulbIcon
                            className={cn(
                              "mr-2 size-4",
                              context.mode === "thinking" &&
                              "text-accent-foreground",
                            )}
                          />
                          {t.inputBox.reasoningMode}
                        </div>
                        <div className="pl-7 text-xs">
                          {t.inputBox.reasoningModeDescription}
                        </div>
                      </div>
                      {context.mode === "thinking" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                  )}
                  <PromptInputActionMenuItem
                    className={cn(
                      context.mode === "pro"
                        ? "text-accent-foreground"
                        : "text-muted-foreground/65",
                    )}
                    onSelect={() => handleModeSelect("pro")}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1 font-bold">
                        <GraduationCapIcon
                          className={cn(
                            "mr-2 size-4",
                            context.mode === "pro" && "text-accent-foreground",
                          )}
                        />
                        {t.inputBox.proMode}
                      </div>
                      <div className="pl-7 text-xs">
                        {t.inputBox.proModeDescription}
                      </div>
                    </div>
                    {context.mode === "pro" ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </PromptInputActionMenuItem>
                  <PromptInputActionMenuItem
                    className={cn(
                      context.mode === "ultra"
                        ? "text-accent-foreground"
                        : "text-muted-foreground/65",
                    )}
                    onSelect={() => handleModeSelect("ultra")}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1 font-bold">
                        <RocketIcon
                          className={cn(
                            "mr-2 size-4",
                            context.mode === "ultra" && "text-[#dabb5e]",
                          )}
                        />
                        <div
                          className={cn(
                            context.mode === "ultra" && "golden-text",
                          )}
                        >
                          {t.inputBox.ultraMode}
                        </div>
                      </div>
                      <div className="pl-7 text-xs">
                        {t.inputBox.ultraModeDescription}
                      </div>
                    </div>
                    {context.mode === "ultra" ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </PromptInputActionMenuItem>
                </PromptInputActionMenu>
              </DropdownMenuGroup>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          {supportReasoningEffort && context.mode !== "flash" && (
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger className="gap-1! px-2!">
                <div className="text-xs font-normal">
                  {t.inputBox.reasoningEffort}:
                  {context.reasoning_effort === "minimal" && " " + t.inputBox.reasoningEffortMinimal}
                  {context.reasoning_effort === "low" && " " + t.inputBox.reasoningEffortLow}
                  {context.reasoning_effort === "medium" && " " + t.inputBox.reasoningEffortMedium}
                  {context.reasoning_effort === "high" && " " + t.inputBox.reasoningEffortHigh}
                </div>
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent className="w-70">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    {t.inputBox.reasoningEffort}
                  </DropdownMenuLabel>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuItem
                      className={cn(
                        context.reasoning_effort === "minimal"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("minimal")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          {t.inputBox.reasoningEffortMinimal}
                        </div>
                        <div className="pl-2 text-xs">
                          {t.inputBox.reasoningEffortMinimalDescription}
                        </div>
                      </div>
                      {context.reasoning_effort === "minimal" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      className={cn(
                        context.reasoning_effort === "low"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("low")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          {t.inputBox.reasoningEffortLow}
                        </div>
                        <div className="pl-2 text-xs">
                          {t.inputBox.reasoningEffortLowDescription}
                        </div>
                      </div>
                      {context.reasoning_effort === "low" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      className={cn(
                        context.reasoning_effort === "medium" || !context.reasoning_effort
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("medium")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          {t.inputBox.reasoningEffortMedium}
                        </div>
                        <div className="pl-2 text-xs">
                          {t.inputBox.reasoningEffortMediumDescription}
                        </div>
                      </div>
                      {context.reasoning_effort === "medium" || !context.reasoning_effort ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem
                      className={cn(
                        context.reasoning_effort === "high"
                          ? "text-accent-foreground"
                          : "text-muted-foreground/65",
                      )}
                      onSelect={() => handleReasoningEffortSelect("high")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 font-bold">
                          {t.inputBox.reasoningEffortHigh}
                        </div>
                        <div className="pl-2 text-xs">
                          {t.inputBox.reasoningEffortHighDescription}
                        </div>
                      </div>
                      {context.reasoning_effort === "high" ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </PromptInputActionMenuItem>
                  </PromptInputActionMenu>
                </DropdownMenuGroup>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          )}

          {/* 竖线分隔 - 在推理级别和 skill 图标之间 */}
          <div className="bg-border h-4 w-px" />

          {/* Skill 图标区域 - 图标之间不需要分隔线 */}
          {/* Skill 按钮组 - 统一紧凑样式 */}
          {(() => {
            const activeSuggestion = t.inputBox.suggestions.find(s => s.skillName === context.skill_name);
            
            if (activeSuggestion) {
              const Icon = activeSuggestion.icon;
              return (
                <div key={activeSuggestion.skillName} className="h-7 flex items-center gap-0.5 bg-primary/10 border border-primary/20 rounded-md px-1 animate-in fade-in-0 zoom-in-95 duration-200">
                  <Tooltip content={settingsPanelOpen ? "点击隐藏设置" : "点击显示设置"}>
                    <button
                      type="button"
                      onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
                      className={cn(
                        "h-5 px-1.5 text-xs font-semibold text-primary hover:text-primary/90 flex items-center gap-1 cursor-pointer rounded-sm hover:bg-primary/5 transition-colors",
                        settingsPanelOpen && "bg-primary/15"
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span>{activeSuggestion.label}</span>
                    </button>
                  </Tooltip>
                  <div className="bg-primary/15 h-3 w-px mx-0.5" />
                  <Tooltip content="取消使用技能">
                    <button
                      type="button"
                      onClick={handleClearSkill}
                      className="size-4.5 rounded-sm flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Tooltip>
                </div>
              );
            }

            return t.inputBox.suggestions.map((s) => ({
              icon: s.icon,
              label: s.label,
              skillName: s.skillName,
              description: s.description,
            })).map((item) => {
              const isSelected = context.skill_name === item.skillName;
              return (
                <Tooltip key={item.label} content={item.description}>
                  <PromptInputButton
                    className={cn(
                      "h-7 px-2.5 text-xs font-normal border-0 shadow-none",
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted/60"
                    )}
                    onClick={() => {
                      onContextChange?.({
                        ...context,
                        skill_name: item.skillName,
                      });
                      setSettingsPanelOpen(true);
                    }}
                  >
                    <item.icon className="size-3.5" />
                    <span className="ml-1">{item.label}</span>
                  </PromptInputButton>
                </Tooltip>
              );
            });
          })()}
        </PromptInputTools>

        {/* 提交和停止按钮 - 置右 */}
        <PromptInputTools>
          {!isStreaming ? (
            <PromptInputSubmit
              className="size-8 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:hover:bg-foreground shadow-sm"
              disabled={submitDisabled}
              variant="default"
              status={status}
            />
          ) : (
            <PromptInputButton
              className="size-8 rounded-full border border-border bg-background text-foreground hover:bg-muted"
              variant="ghost"
              onClick={() => onStop?.()}
            >
              <div className="size-2.5 rounded-sm bg-current" />
            </PromptInputButton>
          )}
        </PromptInputTools>
      </PromptInputFooter>
      {!isNewThread && (
        <div className="bg-background absolute right-0 -bottom-[17px] left-0 z-0 h-4"></div>
      )}
      </PromptInput>

      <SkillCommandMenu
        open={skillMenuOpen}
        search={skillMenuSearch}
        position={skillMenuPosition}
        onOpenChange={(open) => {
          setSkillMenuOpen(open);
          if (!open) {
            setSkillMenuSearch("");
            slashStartPosRef.current = null;
          }
        }}
        onSelect={handleSkillSelect}
        onSearchChange={setSkillMenuSearch}
      />

      {!inputDisabled &&
        !isNewThread &&
        !followupsHidden &&
        (followupsLoading || followups.length > 0) && (
          <div className="absolute right-0 -top-20 left-0 z-20 flex items-center justify-center">
            <div className="flex items-center gap-2">
              {followupsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground bg-background/80 rounded-full border px-4 py-2 text-xs backdrop-blur-sm">
                  {t.inputBox.followupLoading}
                  <button
                    aria-label={t.common.close}
                    className="text-muted-foreground hover:text-foreground cursor-pointer rounded-full p-0.5 transition-colors"
                    type="button"
                    onClick={() => setFollowupsHidden(true)}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Suggestions className="min-h-16 w-fit items-start">
                  {followups.map((s) => (
                    <Suggestion
                      key={s}
                      suggestion={s}
                      onClick={() => handleFollowupClick(s)}
                    />
                  ))}
                  <Button
                    aria-label={t.common.close}
                    className="text-muted-foreground cursor-pointer rounded-full px-3 text-xs font-normal"
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setFollowupsHidden(true)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </Suggestions>
              )}
            </div>
          </div>
        )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inputBox.followupConfirmTitle}</DialogTitle>
            <DialogDescription>
              {t.inputBox.followupConfirmDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="secondary" onClick={confirmAppendAndSend}>
              {t.inputBox.followupConfirmAppend}
            </Button>
            <Button onClick={confirmReplaceAndSend}>
              {t.inputBox.followupConfirmReplace}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


