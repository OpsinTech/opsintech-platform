"use client";

import { 
  BarChart3Icon, 
  BriefcaseIcon, 
  CheckIcon, 
  ChevronDownIcon,
  ChevronUpIcon,
  CompassIcon,
  PresentationIcon, 
  SearchIcon, 
  Table2Icon,
  SlidersIcon,
  UploadIcon,
  XIcon
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAuthApi } from "@/core/api/auth-client";

import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAvailableModels } from "@/core/models/hooks";

export type PPTSettings = {
  pages: number;
  style: "glassmorphism" | "dark-premium" | "gradient-modern" | "minimal-swiss" | "keynote" | "business";
  aspectRatio: "ppt169" | "ppt43" | "wechat" | "xiaohongshu" | "moments" | "story" | "banner" | "a4" | "16:9" | "4:3";
  template: string;
  templatePptx?: string;
  industry: "none" | "finance" | "healthcare" | "technology" | "education" | "retail" | "manufacturing" | "energy" | "realestate" | "legal" | "media" | "logistics" | "agriculture" | "tourism" | "automotive";
  transition: "none" | "fade" | "push" | "wipe" | "split" | "strips" | "cover" | "random";
  animation: "none" | "auto" | "fade" | "fly" | "zoom" | "appear";
  formula: "mixed" | "render-all" | "text-only";
  mergeParagraphs: boolean;
  imageModel?: string;
};

export type DeepResearchSettings = {
  depth: "fast" | "normal" | "deep";
  timeRange: "all" | "1day" | "1week" | "1year";
  sources: string[];
};

export type DataAnalysisSettings = {
  preference: "auto" | "summary" | "sql";
  outputFormat: "markdown" | "csv" | "json";
};

export type ChartVisualizationSettings = {
  chartType: "auto" | "line" | "bar" | "pie" | "radar" | "sankey" | "wordcloud";
  colorTheme: "light" | "dark" | "vibrant";
};

export type ConsultingAnalysisSettings = {
  reportType: "market" | "brand" | "consumer" | "valuation" | "value-chain";
  frameworks: string[];
  language: "zh" | "en";
};

export type PMAnalysisSettings = {
  mode: "discovery" | "competitive" | "requirements";
  framework: "kano" | "rice" | "story-map";
  template: "mvp" | "standard" | "detailed";
};

export type SkillSettings = {
  "ppt-master": PPTSettings;
  "deep-research": DeepResearchSettings;
  "data-analysis": DataAnalysisSettings;
  "chart-visualization": ChartVisualizationSettings;
  "consulting-analysis": ConsultingAnalysisSettings;
  "pm-analysis": PMAnalysisSettings;
};

// Initial default settings
export const DEFAULT_SKILL_SETTINGS: SkillSettings = {
  "ppt-master": {
    pages: 8,
    style: "glassmorphism",
    aspectRatio: "ppt169",
    template: "free",
    industry: "none",
    transition: "fade",
    animation: "auto",
    formula: "mixed",
    mergeParagraphs: false,
    imageModel: undefined,
    templatePptx: undefined,
  },
  "deep-research": {
    depth: "normal",
    timeRange: "all",
    sources: ["academic", "news", "tech", "business"],
  },
  "data-analysis": {
    preference: "auto",
    outputFormat: "markdown",
  },
  "chart-visualization": {
    chartType: "auto",
    colorTheme: "light",
  },
  "consulting-analysis": {
    reportType: "market",
    frameworks: ["SWOT", "PESTEL"],
    language: "zh",
  },
  "pm-analysis": {
    mode: "discovery",
    framework: "rice",
    template: "standard",
  },
};

const LOCALIZED_MAP = {
  "zh-CN": {
    ppt: {
      title: "PPT 生成设置",
      pages: "幻灯片页数",
      style: "视觉风格",
      aspectRatio: "画布规格",
      aspectRatioOptions: {
        ppt169: "标准横屏 16:9 (ppt169)",
        ppt43: "传统横屏 4:3 (ppt43)",
        wechat: "微信公众号封面 2.35:1",
        xiaohongshu: "小红书竖屏 3:4",
        moments: "朋友圈/正方形 1:1",
        story: "短视频/故事竖屏 9:16",
        banner: "横排大屏 Banner 16:9",
        a4: "A4 打印/PDF 报告",
        "16:9": "标准横屏 16:9 (ppt169)",
        "4:3": "传统横屏 4:3 (ppt43)",
      },
      styleOptions: {
        glassmorphism: "毛玻璃 (Glassmorphism)",
        "dark-premium": "暗黑奢华 (Dark Premium)",
        "gradient-modern": "渐变现代 (Gradient Modern)",
        "minimal-swiss": "极简瑞士 (Minimal Swiss)",
        keynote: "苹果会风 (Keynote)",
        business: "传统商务 (Business)",
      },
      template: "排版预设/模板",
      templateOptions: {
        free: "自由设计 (Free Design)",
        academic_defense: "学术答辩 (Academic Defense)",
        ai_ops: "智能运维 (AI Ops)",
        government_blue: "政务蓝 (Government Blue)",
        government_red: "政务红 (Government Red)",
        medical_university: "医学高校 (Medical University)",
        pixel_retro: "复古像素 (Pixel Retro)",
        psychology_attachment: "心理与情感 (Psychology)",
      },
      industry: "行业色彩预设",
      industryOptions: {
        none: "自由色彩 (无预设)",
        finance: "金融/银行 (Finance)",
        healthcare: "医疗/健康 (Healthcare)",
        technology: "科技/互联网 (Technology)",
        education: "教育/培训 (Education)",
        retail: "零售/消费 (Retail)",
        manufacturing: "制造/工业 (Manufacturing)",
        energy: "能源/环保 (Energy)",
        realestate: "房地产/建筑 (Real Estate)",
        legal: "法律/合规 (Legal)",
        media: "媒体/娱乐 (Media)",
        logistics: "物流/供应链 (Logistics)",
        agriculture: "农业/食品 (Agriculture)",
        tourism: "旅游/酒店 (Tourism)",
        automotive: "汽车/交通 (Automotive)",
      },
      advancedSettings: "高级选项",
      transition: "转场效果",
      transitionOptions: {
        none: "无转场",
        fade: "淡出淡入 (Fade)",
        push: "推送效果 (Push)",
        wipe: "擦除效果 (Wipe)",
        split: "分割效果 (Split)",
        strips: "条纹效果 (Strips)",
        cover: "覆盖效果 (Cover)",
        random: "随机转场 (Random)",
      },
      animation: "元素入场动画",
      animationOptions: {
        none: "无动画",
        auto: "智能匹配 (Auto)",
        fade: "渐变淡入 (Fade)",
        fly: "飞入效果 (Fly)",
        zoom: "缩放效果 (Zoom)",
        appear: "直接出现 (Appear)",
      },
      formula: "数学公式策略",
      formulaOptions: {
        mixed: "混合渲染 (复杂公式转图片)",
        "render-all": "全部公式转图片",
        "text-only": "纯文本/Unicode 模式",
      },
      mergeParagraphs: "优先可编辑合并段落",
      mergeParagraphsTip: "开启后，行文本会合并为整块文本框，更易后期编辑，但对齐可能发生轻微重排",
      imageModel: "文生图模型",
      imageModelNone: "无 (停用生图)",
    },
    research: {
      title: "深度研究设置",
      depth: "调研深度",
      depthOptions: {
        fast: "快速探索",
        normal: "标准深度",
        deep: "行业研报级",
      },
      depthTips: {
        fast: "2-3轮搜索，快速概览",
        normal: "5-8轮搜索，适合日常调研",
        deep: "10轮+搜索，全面深探",
      },
      timeRange: "数据时效性",
      timeOptions: {
        all: "不限时间",
        "1day": "近 24 小时",
        "1week": "近 1 周",
        "1year": "近 1 年",
      },
      sources: "专业信息源",
      sourceOptions: {
        academic: "学术文献",
        news: "即时新闻",
        tech: "技术文档",
        business: "商业报告",
      },
    },
    analysis: {
      title: "数据分析设置",
      preference: "分析偏好",
      prefOptions: {
        auto: "智能推荐",
        summary: "描述统计",
        sql: "高级 SQL",
      },
      prefTips: {
        auto: "自动选择最佳分析手段",
        summary: "计算汇总与概览数据",
        sql: "使用 DuckDB 运行 SQL 查询",
      },
      format: "结果格式",
      formatOptions: {
        markdown: "网页表格",
        csv: "CSV 下载",
        json: "JSON 数据",
      },
    },
    chart: {
      title: "图表可视化设置",
      type: "目标图表",
      typeOptions: {
        auto: "智能匹配",
        line: "趋势折线图",
        bar: "对比柱状图",
        pie: "占比饼图",
        radar: "雷达对比图",
        sankey: "桑基流量图",
        wordcloud: "词云图",
      },
      theme: "色彩主题",
      themeOptions: {
        light: "经典亮色",
        dark: "科技暗色",
        vibrant: "渐变亮丽",
      },
    },
    consulting: {
      title: "咨询分析设置",
      type: "报告类型",
      typeOptions: {
        market: "市场分析",
        brand: "品牌策略",
        consumer: "消费者洞察",
        valuation: "财务估值",
        "value-chain": "价值链研究",
      },
      frameworks: "分析模型框架",
      frameworkOptions: {
        SWOT: "SWOT 分析",
        PESTEL: "PESTEL 分析",
        porter: "波特五力",
        bcg: "BCG 矩阵",
        "3c": "3C 模型",
      },
      lang: "输出语言",
      langOptions: {
        zh: "中文",
        en: "English",
      },
    },
    pm: {
      title: "PM 需求分析设置",
      mode: "分析阶段",
      modeOptions: {
        discovery: "机会评估 (Cagan)",
        competitive: "竞品对标 (战略画布)",
        requirements: "需求与 PRD",
      },
      framework: "核心框架",
      frameworkOptions: {
        kano: "Kano 需求模型",
        rice: "RICE 优先级打分",
        "story-map": "用户故事地图",
      },
      template: "PRD 模板",
      templateOptions: {
        mvp: "精益 MVP 规格",
        standard: "敏捷标准模版",
        detailed: "深度商业规格",
      },
    },
  },
  "en-US": {
    ppt: {
      title: "PPT Settings",
      pages: "Slides Count",
      style: "Design Style",
      aspectRatio: "Canvas Format",
      aspectRatioOptions: {
        ppt169: "Standard 16:9 (ppt169)",
        ppt43: "Traditional 4:3 (ppt43)",
        wechat: "WeChat Cover 2.35:1",
        xiaohongshu: "Xiaohongshu 3:4",
        moments: "Square Moments 1:1",
        story: "Vertical Story 9:16",
        banner: "Wide Banner 16:9",
        a4: "A4 Print / PDF",
        "16:9": "Standard 16:9 (ppt169)",
        "4:3": "Traditional 4:3 (ppt43)",
      },
      styleOptions: {
        glassmorphism: "Glassmorphism",
        "dark-premium": "Dark Premium",
        "gradient-modern": "Gradient Modern",
        "minimal-swiss": "Minimal Swiss",
        keynote: "Apple Keynote",
        business: "Business",
      },
      template: "Layout Template",
      templateOptions: {
        free: "Free Design",
        academic_defense: "Academic Defense",
        ai_ops: "AI Ops",
        government_blue: "Government Blue",
        government_red: "Government Red",
        medical_university: "Medical University",
        pixel_retro: "Pixel Retro",
        psychology_attachment: "Psychology & Emotion",
      },
      industry: "Industry Colors",
      industryOptions: {
        none: "Free (No Preset)",
        finance: "Finance & Banking",
        healthcare: "Healthcare & Medical",
        technology: "Technology & Internet",
        education: "Education & Training",
        retail: "Retail & Consumer",
        manufacturing: "Manufacturing & Industrial",
        energy: "Energy & Environmental",
        realestate: "Real Estate & Construction",
        legal: "Legal & Compliance",
        media: "Media & Entertainment",
        logistics: "Logistics & Supply Chain",
        agriculture: "Agriculture & Food",
        tourism: "Tourism & Hospitality",
        automotive: "Automotive & Transport",
      },
      advancedSettings: "Advanced Settings",
      transition: "Transition Effect",
      transitionOptions: {
        none: "None",
        fade: "Fade",
        push: "Push",
        wipe: "Wipe",
        split: "Split",
        strips: "Strips",
        cover: "Cover",
        random: "Random",
      },
      animation: "Entrance Animation",
      animationOptions: {
        none: "None",
        auto: "Auto (Recommended)",
        fade: "Fade",
        fly: "Fly In",
        zoom: "Zoom",
        appear: "Appear",
      },
      formula: "Formula Rendering",
      formulaOptions: {
        mixed: "Mixed Mode (PNG for complex)",
        "render-all": "Render All to PNG",
        "text-only": "Unicode Text Only",
      },
      mergeParagraphs: "Merge Paragraphs (Editable)",
      mergeParagraphsTip: "Merge lines in textboxes into wrapping blocks for easier manual editing in PowerPoint.",
      imageModel: "Text-to-Image Model",
      imageModelNone: "None (Disable Image Gen)",
    },
    research: {
      title: "Deep Research Settings",
      depth: "Research Depth",
      depthOptions: {
        fast: "Fast",
        normal: "Normal",
        deep: "Industry Report",
      },
      depthTips: {
        fast: "2-3 search rounds, quick overview",
        normal: "5-8 search rounds, best for general research",
        deep: "10+ rounds, fully comprehensive investigation",
      },
      timeRange: "Time Range",
      timeOptions: {
        all: "All Time",
        "1day": "Past 24 Hours",
        "1week": "Past Week",
        "1year": "Past Year",
      },
      sources: "Sources",
      sourceOptions: {
        academic: "Academic",
        news: "Real-time News",
        tech: "Tech Docs",
        business: "Business Reports",
      },
    },
    analysis: {
      title: "Data Analysis Settings",
      preference: "Analysis Pref",
      prefOptions: {
        auto: "Auto Rec",
        summary: "Descriptive",
        sql: "DuckDB SQL",
      },
      prefTips: {
        auto: "Auto choose best tools",
        summary: "Compute metrics summary",
        sql: "Run complex DuckDB queries",
      },
      format: "Output Format",
      formatOptions: {
        markdown: "Markdown Table",
        csv: "CSV Download",
        json: "JSON Output",
      },
    },
    chart: {
      title: "Visualization Settings",
      type: "Chart Type",
      typeOptions: {
        auto: "Smart Auto",
        line: "Line Chart",
        bar: "Bar Chart",
        pie: "Pie Chart",
        radar: "Radar Chart",
        sankey: "Sankey Flow",
        wordcloud: "Word Cloud",
      },
      theme: "Color Theme",
      themeOptions: {
        light: "Classic Light",
        dark: "Tech Dark",
        vibrant: "Vibrant Gradient",
      },
    },
    consulting: {
      title: "Consulting Settings",
      type: "Report Type",
      typeOptions: {
        market: "Market",
        brand: "Brand Strategy",
        consumer: "Consumer Insights",
        valuation: "Valuation",
        "value-chain": "Value Chain",
      },
      frameworks: "Frameworks",
      frameworkOptions: {
        SWOT: "SWOT Analysis",
        PESTEL: "PESTEL Analysis",
        porter: "Porter's Five Forces",
        bcg: "BCG Matrix",
        "3c": "3C Model",
      },
      lang: "Language",
      langOptions: {
        zh: "Chinese",
        en: "English",
      },
    },
    pm: {
      title: "PM Analysis Settings",
      mode: "Analysis Phase",
      modeOptions: {
        discovery: "Opportunity Assessment",
        competitive: "Competitive Benchmarking",
        requirements: "Requirements & PRD",
      },
      framework: "Framework",
      frameworkOptions: {
        kano: "Kano Model",
        rice: "RICE Scoring",
        "story-map": "User Story Mapping",
      },
      template: "PRD Template",
      templateOptions: {
        mvp: "Lean MVP Spec",
        standard: "Standard Agile PRD",
        detailed: "Detailed Business Spec",
      },
    },
  },
};

interface SkillSettingsPanelProps {
  skillName: string;
  settings: SkillSettings;
  onChange: (settings: SkillSettings) => void;
  onClose?: () => void;
  locale?: string;
  threadId?: string;
}

export function SkillSettingsPanel({
  skillName,
  settings: propSettings,
  onChange,
  onClose,
  locale = "zh-CN",
  threadId,
}: SkillSettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userTemplates, setUserTemplates] = useState<Array<{ name: string; path: string; kind: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const { models: availableModels } = useAvailableModels();

  useEffect(() => {
    if (skillName !== "ppt-master" || !threadId) return;
    fetchAuthApi(`/api/templates?thread_id=${encodeURIComponent(threadId)}`)
      .then((res) => res.ok ? res.json() as Promise<Array<{ name: string; path: string; kind: string }>> : [])
      .then((data) => setUserTemplates(data))
      .catch(() => {});
  }, [skillName, threadId]);

  const handleUploadTemplate = useCallback(async () => {
    if (!threadId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pptx,.ppt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file, file.name);
        formData.append("name", file.name.replace(/\.(pptx|ppt)$/i, ""));
        const res = await fetchAuthApi(`/api/templates/upload?thread_id=${encodeURIComponent(threadId)}`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        setUserTemplates((prev) => [...prev, data]);
        updateSetting("ppt-master", (prev) => ({ ...prev, template: "free", templatePptx: data.path }));
      } catch (e) {
        console.error("Template upload failed:", e);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }, [threadId]);

  const handleDeleteTemplate = useCallback(async (tpl: { name: string; path: string }) => {
    if (!threadId) return;
    try {
      const res = await fetchAuthApi(
        `/api/templates?thread_id=${encodeURIComponent(threadId)}&name=${encodeURIComponent(tpl.name)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Delete failed");
      setUserTemplates((prev) => prev.filter((t) => t.path !== tpl.path));
      // If the deleted template was selected, clear it
      updateSetting("ppt-master", (prev) => {
        if (prev.templatePptx === tpl.path) {
          return { ...prev, template: "free", templatePptx: undefined };
        }
        return prev;
      });
    } catch (e) {
      console.error("Template delete failed:", e);
    }
  }, [threadId]);

  const text2ImageModels = useMemo(() => {
    return (availableModels ?? []).filter(m => m.supports_text2image && m.enabled !== false);
  }, [availableModels]);

  // Merge default settings to handle hot-reloads and backward-compatible state
  const settings = useMemo(() => ({
    ...DEFAULT_SKILL_SETTINGS,
    ...propSettings,
  }), [propSettings]);
  // Normalize locale key
  const activeLocale = locale.startsWith("zh") ? "zh-CN" : "en-US";
  const t = LOCALIZED_MAP[activeLocale];

  const currentImageModel = settings["ppt-master"].imageModel;

  React.useEffect(() => {
    if (skillName === "ppt-master" && currentImageModel === undefined) {
      const firstModel = text2ImageModels[0];
      const defaultModel = firstModel ? firstModel.name : "none";
      updateSetting("ppt-master", (prev) => ({ ...prev, imageModel: defaultModel }));
    }
  }, [skillName, text2ImageModels, currentImageModel]);

  const updateSetting = <K extends keyof SkillSettings>(
    skillKey: K,
    updater: (prev: SkillSettings[K]) => SkillSettings[K]
  ) => {
    onChange({
      ...settings,
      [skillKey]: updater(settings[skillKey]),
    });
  };

  const currentSkillIcon = useMemo(() => {
    switch (skillName) {
      case "ppt-master":
        return <PresentationIcon className="size-4 text-primary" />;
      case "deep-research":
        return <SearchIcon className="size-4 text-primary" />;
      case "data-analysis":
        return <Table2Icon className="size-4 text-primary" />;
      case "chart-visualization":
        return <BarChart3Icon className="size-4 text-primary" />;
      case "consulting-analysis":
        return <BriefcaseIcon className="size-4 text-primary" />;
      case "pm-analysis":
        return <CompassIcon className="size-4 text-primary" />;
      default:
        return <SlidersIcon className="size-4 text-primary" />;
    }
  }, [skillName]);

  // If skillName is not one of the 5 customizable skills, do not render settings
  if (
    !["ppt-master", "deep-research", "data-analysis", "chart-visualization", "consulting-analysis", "pm-analysis"].includes(
      skillName
    )
  ) {
    return null;
  }

  // Normalize legacy aspect ratio values if they exist in prop settings
  const normalizedAspect = settings["ppt-master"].aspectRatio === "16:9" 
    ? "ppt169" 
    : (settings["ppt-master"].aspectRatio === "4:3" ? "ppt43" : settings["ppt-master"].aspectRatio);

  return (
    <TooltipProvider delayDuration={150}>
      <div 
        className={cn(
          "w-full bg-muted/20 dark:bg-muted/10 backdrop-blur-md px-4 py-3.5 border-b border-border/40 transition-all duration-300 animate-in fade-in slide-in-from-top-4"
        )}
      >
        <div className="flex items-center justify-between gap-1.5 mb-2.5">
          <div className="flex items-center gap-1.5">
            {currentSkillIcon}
            <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
              {skillName === "ppt-master" && t.ppt.title}
              {skillName === "deep-research" && t.research.title}
              {skillName === "data-analysis" && t.analysis.title}
              {skillName === "chart-visualization" && t.chart.title}
              {skillName === "consulting-analysis" && t.consulting.title}
              {skillName === "pm-analysis" && t.pm.title}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground cursor-pointer rounded-full p-0.5 hover:bg-muted/80 transition-colors"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>

        {/* 1. PPT Generation Panel */}
        {skillName === "ppt-master" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Pages Slider */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.pages}</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={20}
                  value={settings["ppt-master"].pages}
                  onChange={(e) => {
                    const pages = parseInt(e.target.value, 10);
                    updateSetting("ppt-master", (prev) => ({ ...prev, pages }));
                  }}
                  className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                />
                <input
                  type="number"
                  min={5}
                  max={20}
                  value={settings["ppt-master"].pages}
                  onChange={(e) => {
                    let val = parseInt(e.target.value, 10);
                    if (isNaN(val)) val = 5;
                    val = Math.max(5, Math.min(20, val));
                    updateSetting("ppt-master", (prev) => ({ ...prev, pages: val }));
                  }}
                  className="w-12 h-8 text-center text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* Design Style Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.style}</span>
              <Select
                value={settings["ppt-master"].style}
                onValueChange={(val: PPTSettings["style"]) => {
                  updateSetting("ppt-master", (prev) => ({ ...prev, style: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {Object.entries(t.ppt.styleOptions).map(([key, label]) => {
                    const descriptions: Record<string, string> = {
                      glassmorphism: "「极光渐变 + 半透明磨砂卡片」",
                      "dark-premium": "「高科技暗黑 + 奢华金线质感」",
                      "gradient-modern": "「大跨度渐变 + 扁平活力化排版」",
                      "minimal-swiss": "「冷淡瑞士风 + 经典无衬线大字」",
                      keynote: "「标准灰白极简 + 呼吸感间距」",
                      business: "「经典深蓝偏商务 + 专业分栏列表」",
                    };
                    return (
                      <SelectItem key={key} value={key} className="text-xs cursor-pointer py-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{label}</span>
                          <span className="text-[10px] text-muted-foreground font-normal [[data-slot=select-value]_&]:hidden">{descriptions[key]}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Template Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.template}</span>
              <Select
                value={settings["ppt-master"].template}
                onValueChange={(val: string) => {
                  updateSetting("ppt-master", (prev) => ({ ...prev, template: val, templatePptx: undefined }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {Object.entries(t.ppt.templateOptions).map(([key, label]) => {
                    const descriptions: Record<string, string> = {
                      free: "AI 自由设计：由 AI 根据内容自主匹配最佳视觉布局",
                      academic_defense: "学术答辩：标准双栏排版，带目录及分章节标识",
                      ai_ops: "智能运维：科技感蓝绿主题，集成流程与拓扑骨架",
                      government_blue: "政务蓝：深蓝色调配合红旗、缎带装饰，庄重大气",
                      government_red: "政务红：经典红金政务风，适合汇报与总结",
                      medical_university: "医学健康：生命浅绿配色，网格数据对比与表格",
                      pixel_retro: "像素复古：8-bit 像素游戏风，趣味拼贴与装饰线",
                      psychology_attachment: "心理疗愈：温暖米粉色调，圆角卡片及治愈系插画",
                    };
                    return (
                      <SelectItem key={key} value={key} className="text-xs cursor-pointer py-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{label}</span>
                          <span className="text-[10px] text-muted-foreground font-normal [[data-slot=select-value]_&]:hidden">{descriptions[key]}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                  {userTemplates.map((tpl) => (
                    <SelectItem key={tpl.path} value={tpl.path} className="text-xs cursor-pointer group">
                      <span className="flex items-center justify-between w-full">
                        <span>{tpl.name}</span>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            void handleDeleteTemplate(tpl);
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded-sm cursor-pointer z-10"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={handleUploadTemplate}
                disabled={uploading}
                className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors hover:underline cursor-pointer"
              >
                <UploadIcon className="size-3" />
                {uploading ? "上传中..." : "上传自定义模板 (.pptx)"}
              </button>
            </div>

            {/* Canvas Format Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.aspectRatio}</span>
              <Select
                value={normalizedAspect}
                onValueChange={(val: PPTSettings["aspectRatio"]) => {
                  updateSetting("ppt-master", (prev) => ({ ...prev, aspectRatio: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {Object.entries(t.ppt.aspectRatioOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advanced Settings Toggle & Section */}
            <div className="col-span-1 md:col-span-5 mt-1 border-t border-border/20 pt-2.5">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 cursor-pointer select-none transition-colors"
              >
                <span>{t.ppt.advancedSettings}</span>
                {showAdvanced ? (
                  <ChevronUpIcon className="size-3" />
                ) : (
                  <ChevronDownIcon className="size-3" />
                )}
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Industry Colors Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.industry}</span>
                    <Select
                      value={settings["ppt-master"].industry || "none"}
                      onValueChange={(val: PPTSettings["industry"]) => {
                        updateSetting("ppt-master", (prev) => ({ ...prev, industry: val }));
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Object.entries(t.ppt.industryOptions).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Transition Effect Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.transition}</span>
                    <Select
                      value={settings["ppt-master"].transition || "fade"}
                      onValueChange={(val: PPTSettings["transition"]) => {
                        updateSetting("ppt-master", (prev) => ({ ...prev, transition: val }));
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Object.entries(t.ppt.transitionOptions).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Entrance Animation Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.animation}</span>
                    <Select
                      value={settings["ppt-master"].animation || "auto"}
                      onValueChange={(val: PPTSettings["animation"]) => {
                        updateSetting("ppt-master", (prev) => ({ ...prev, animation: val }));
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Object.entries(t.ppt.animationOptions).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Formula Policy Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.formula}</span>
                    <Select
                      value={settings["ppt-master"].formula || "mixed"}
                      onValueChange={(val: PPTSettings["formula"]) => {
                        updateSetting("ppt-master", (prev) => ({ ...prev, formula: val }));
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Object.entries(t.ppt.formulaOptions).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Text-to-Image Model Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t.ppt.imageModel}</span>
                    <Select
                      value={settings["ppt-master"].imageModel || "none"}
                      onValueChange={(val: string) => {
                        updateSetting("ppt-master", (prev) => ({ ...prev, imageModel: val }));
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="none" className="text-xs cursor-pointer">
                          {t.ppt.imageModelNone}
                        </SelectItem>
                        {text2ImageModels.map((model) => (
                          <SelectItem key={model.name} value={model.name} className="text-xs cursor-pointer">
                            {model.display_name || model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Merge Paragraphs Switch */}
                  <div className="col-span-1 md:col-span-5 flex items-center justify-between border-t border-border/10 pt-3 mt-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground/80">{t.ppt.mergeParagraphs}</span>
                      <span className="text-[10px] text-muted-foreground max-w-2xl">{t.ppt.mergeParagraphsTip}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!settings["ppt-master"].mergeParagraphs}
                        onChange={(e) => {
                          const val = e.target.checked;
                          updateSetting("ppt-master", (prev) => ({ ...prev, mergeParagraphs: val }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer dark:bg-muted/80 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. Deep Research Panel */}
        {skillName === "deep-research" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Research Depth */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.research.depth}</span>
              <div className="flex bg-muted/65 rounded-md p-0.5 h-8">
                {(["fast", "normal", "deep"] as const).map((d) => {
                  const isSel = settings["deep-research"].depth === d;
                  const label = t.research.depthOptions[d];
                  const tooltip = t.research.depthTips[d];
                  return (
                    <Tooltip key={d}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            updateSetting("deep-research", (prev) => ({ ...prev, depth: d }));
                          }}
                          className={cn(
                            "flex-1 text-xs font-medium rounded transition-all cursor-pointer truncate px-1",
                            isSel 
                              ? "bg-background text-primary shadow-xs font-semibold" 
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {tooltip}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            {/* Time Range */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.research.timeRange}</span>
              <Select
                value={settings["deep-research"].timeRange}
                onValueChange={(val: DeepResearchSettings["timeRange"]) => {
                  updateSetting("deep-research", (prev) => ({ ...prev, timeRange: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.research.timeOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sources Multi-select */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.research.sources}</span>
              <div className="flex flex-wrap gap-1">
                {Object.entries(t.research.sourceOptions).map(([key, label]) => {
                  const isSel = settings["deep-research"].sources.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        updateSetting("deep-research", (prev) => {
                          const nextSources = prev.sources.includes(key)
                            ? prev.sources.filter((s) => s !== key)
                            : [...prev.sources, key];
                          return { ...prev, sources: nextSources };
                        });
                      }}
                      className={cn(
                        "h-6 px-2 rounded-full text-[10px] font-medium transition-all flex items-center gap-0.5 cursor-pointer border border-transparent",
                        isSel
                          ? "bg-primary/10 text-primary border-primary/20 font-semibold"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      )}
                    >
                      {isSel && <CheckIcon className="size-2.5 shrink-0" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3. Data Analysis Panel */}
        {skillName === "data-analysis" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Analysis Preference */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.analysis.preference}</span>
              <div className="flex bg-muted/65 rounded-md p-0.5 h-8">
                {(["auto", "summary", "sql"] as const).map((p) => {
                  const isSel = settings["data-analysis"].preference === p;
                  const label = t.analysis.prefOptions[p];
                  const tooltip = t.analysis.prefTips[p];
                  return (
                    <Tooltip key={p}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            updateSetting("data-analysis", (prev) => ({ ...prev, preference: p }));
                          }}
                          className={cn(
                            "flex-1 text-xs font-medium rounded transition-all cursor-pointer truncate px-1",
                            isSel 
                              ? "bg-background text-primary shadow-xs font-semibold" 
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {tooltip}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            {/* Output Format */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.analysis.format}</span>
              <Select
                value={settings["data-analysis"].outputFormat}
                onValueChange={(val: DataAnalysisSettings["outputFormat"]) => {
                  updateSetting("data-analysis", (prev) => ({ ...prev, outputFormat: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.analysis.formatOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* 4. Chart Visualization Panel */}
        {skillName === "chart-visualization" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Target Chart Type */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.chart.type}</span>
              <Select
                value={settings["chart-visualization"].chartType}
                onValueChange={(val: ChartVisualizationSettings["chartType"]) => {
                  updateSetting("chart-visualization", (prev) => ({ ...prev, chartType: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.chart.typeOptions).map(([key, label]) => {
                    const descriptions: Record<string, string> = {
                      auto: "自动选择：根据数据特征智能生成最佳图表类型",
                      line: "折线图：最适合表现数据随连续时间变化的趋势变化",
                      bar: "柱状图：适合比较不同类别/项目之间的数量高低",
                      pie: "饼图：展示各组成部分占总体的比例或百分比关系",
                      radar: "雷达图：适用于评估和展现多个维度的综合实力分布",
                      sankey: "桑基图：展示数据/能量/流量流转与多层级分流走向",
                      wordcloud: "词云图：直观展示文本关键词的词频热度与比重",
                    };
                    return (
                      <SelectItem key={key} value={key} className="text-xs cursor-pointer py-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{label}</span>
                          <span className="text-[10px] text-muted-foreground font-normal [[data-slot=select-value]_&]:hidden">{descriptions[key]}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Color Theme */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.chart.theme}</span>
              <div className="flex bg-muted/65 rounded-md p-0.5 h-8">
                {(["light", "dark", "vibrant"] as const).map((theme) => {
                  const isSel = settings["chart-visualization"].colorTheme === theme;
                  const label = t.chart.themeOptions[theme];
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        updateSetting("chart-visualization", (prev) => ({ ...prev, colorTheme: theme }));
                      }}
                      className={cn(
                        "flex-1 text-xs font-medium rounded transition-all cursor-pointer px-1 truncate",
                        isSel 
                          ? "bg-background text-primary shadow-xs font-semibold" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 5. Consulting Analysis Panel */}
        {skillName === "consulting-analysis" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Report Type */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.consulting.type}</span>
              <Select
                value={settings["consulting-analysis"].reportType}
                onValueChange={(val: ConsultingAnalysisSettings["reportType"]) => {
                  updateSetting("consulting-analysis", (prev) => ({ ...prev, reportType: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.consulting.typeOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frameworks Multi-select */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.consulting.frameworks}</span>
              <div className="flex flex-wrap gap-1">
                {Object.entries(t.consulting.frameworkOptions).map(([key, label]) => {
                  const isSel = settings["consulting-analysis"].frameworks.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        updateSetting("consulting-analysis", (prev) => {
                          const nextFws = prev.frameworks.includes(key)
                            ? prev.frameworks.filter((f) => f !== key)
                            : [...prev.frameworks, key];
                          return { ...prev, frameworks: nextFws };
                        });
                      }}
                      className={cn(
                        "h-6 px-2.5 rounded text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer border border-transparent",
                        isSel
                          ? "bg-primary/10 text-primary border-primary/20 font-semibold"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      )}
                    >
                      {isSel && <CheckIcon className="size-2.5 shrink-0 text-primary" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.consulting.lang}</span>
              <div className="flex bg-muted/65 rounded-md p-0.5 h-8">
                {(["zh", "en"] as const).map((l) => {
                  const isSel = settings["consulting-analysis"].language === l;
                  const label = t.consulting.langOptions[l];
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        updateSetting("consulting-analysis", (prev) => ({ ...prev, language: l }));
                      }}
                      className={cn(
                        "flex-1 text-xs font-medium rounded transition-all cursor-pointer",
                        isSel 
                          ? "bg-background text-primary shadow-xs font-semibold" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 6. PM Analysis Panel */}
        {skillName === "pm-analysis" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Analysis Mode */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.pm.mode}</span>
              <Select
                value={settings["pm-analysis"].mode}
                onValueChange={(val: PMAnalysisSettings["mode"]) => {
                  updateSetting("pm-analysis", (prev) => ({ ...prev, mode: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.pm.modeOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Framework */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.pm.framework}</span>
              <Select
                value={settings["pm-analysis"].framework}
                onValueChange={(val: PMAnalysisSettings["framework"]) => {
                  updateSetting("pm-analysis", (prev) => ({ ...prev, framework: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.pm.frameworkOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Template */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t.pm.template}</span>
              <Select
                value={settings["pm-analysis"].template}
                onValueChange={(val: PMAnalysisSettings["template"]) => {
                  updateSetting("pm-analysis", (prev) => ({ ...prev, template: val }));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full border-border/50 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.pm.templateOptions).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs cursor-pointer">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
