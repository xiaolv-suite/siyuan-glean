<script lang="ts">
/** 设置视图：分类导航与连续配置分组，保留草稿、保存回执及维护任务入口。 */
import { onMount, tick } from "svelte";
import { getFrontend, showMessage } from "siyuan";
import { listNotebooks, type NotebookMeta } from "../api/client";
import { rebuildIndex } from "../services/clip-store";
import { bindAllClipsToLibrary } from "../services/library-db";
import { usageToday, loadAiLog, type AiLogEntry } from "../services/enrich-service";
import { listCheckinItems, type CheckinItemOption } from "../services/checkin-bridge";
import { testDirectChannel } from "../api/ai-direct";
import { inspectCustomEndpointSecurity } from "../domain/ai-direct";
import { t } from "../libs/i18n";
import { DEFAULT_SETTINGS, cloneSettings, loadSettings, mergeSettingsDraft, normalizeSettings, SettingsConflictError, settingsEqual, type GleanSettings } from "../services/settings";
import { loadUiPrefs, saveUiPrefs } from "../services/prefs";
import { THEME_PALETTES, type ThemePaletteId } from "../domain/theme-palette";
import { applyThemePaletteToDom } from "../libs/theme-palette-controller";
import type { GleanFacade } from "../types";
import { exportAnonymousDiagnostic, exportLibraryCsv, exportLibraryMarkdownArchive } from "../services/library-export-service";
import { installEscapeHandler } from "../libs/modal-focus";
import BackupPanel from "./BackupPanel.svelte";
import FlashcardRecoveryPanel from "./FlashcardRecoveryPanel.svelte";
import AiTagMergePanel from "./AiTagMergePanel.svelte";
import SnapshotGovernance from "./SnapshotGovernance.svelte";
import { lvEcosystem } from "../libs/notice";

interface Props {
    facade: GleanFacade;
    onClose?: () => void;
    registerCloseGuard?: (guard: () => boolean) => () => void;
}

let { facade, onClose, registerCloseGuard }: Props = $props();

const i18n = $derived(facade.i18n);
const instanceId = $props.id();
const idPrefix = `glean-settings-${instanceId}`;
const titleId = `${idPrefix}-title`;
const navLabelId = `${idPrefix}-nav-label`;
const panelId = `${idPrefix}-panel`;

/** 设置分类（T-3314）：参照 Obsidian/思源的"左导航 + 右内容"设置范式，11 个平铺组归并为 8 个大类。 */
type SettingsSectionId = "workspace" | "resurface" | "reading" | "ai" | "aiChannel" | "integration" | "data" | "maintenance";
const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; labelKey: string; titleKey: string; descKey: string; iconHref: string }> = [
    { id: "workspace", labelKey: "settings.nav.workspace", titleKey: "settings.workspaceGroup", descKey: "settings.desc.workspace", iconHref: "#iconGleanWheat" },
    { id: "resurface", labelKey: "settings.nav.resurface", titleKey: "settings.resurfaceGroup", descKey: "settings.desc.resurface", iconHref: "#iconGleanRefresh" },
    { id: "reading", labelKey: "settings.nav.reading", titleKey: "settings.readerGroup", descKey: "settings.desc.reading", iconHref: "#iconGleanCard" },
    { id: "ai", labelKey: "settings.nav.ai", titleKey: "settings.aiGroup", descKey: "settings.desc.ai", iconHref: "#iconGleanSpark" },
    { id: "aiChannel", labelKey: "settings.nav.aiChannel", titleKey: "settings.aiChannelGroup", descKey: "settings.desc.aiChannel", iconHref: "#iconGleanSearch" },
    { id: "integration", labelKey: "settings.nav.integration", titleKey: "settings.checkinGroup", descKey: "settings.desc.integration", iconHref: "#iconGleanExternal" },
    { id: "data", labelKey: "settings.nav.data", titleKey: "settings.dataGroup", descKey: "settings.desc.data", iconHref: "#iconGleanArchive" },
    { id: "maintenance", labelKey: "settings.nav.maintenance", titleKey: "settings.maintenanceToolsGroup", descKey: "settings.desc.maintenance", iconHref: "#iconGleanGear" },
];
let activeSection = $state<SettingsSectionId>("workspace");
const activeSectionMeta = $derived(SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]);

let notebooks = $state<NotebookMeta[]>([]);
let notebookLoading = $state(false);
let notebookLoadError = $state(false);
let notebookFilter = $state("");
let anchorNotebooks = $state<string[]>([...DEFAULT_SETTINGS.anchorNotebooks]);
let snapshotOnCapture = $state(DEFAULT_SETTINGS.snapshotOnCapture);
let aiEnrichMode = $state<"off" | "manual" | "auto">(DEFAULT_SETTINGS.ai.enrichMode);
let aiDailyCap = $state(DEFAULT_SETTINGS.ai.enrichDailyCap);
let aiDedup = $state(DEFAULT_SETTINGS.ai.dedupOnEnrich);
let aiRelated = $state(DEFAULT_SETTINGS.ai.relatedWhileReading);
let aiFormatting = $state(DEFAULT_SETTINGS.ai.formattingEnabled);
let aiAuthorSuggestion = $state(DEFAULT_SETTINGS.ai.authorSuggestionEnabled);
let aiQuestionCard = $state(DEFAULT_SETTINGS.ai.questionCardEnabled);
let aiArticleQuestion = $state(DEFAULT_SETTINGS.ai.articleQuestionEnabled);
let aiActions = $state(DEFAULT_SETTINGS.ai.presetActions);
let usageCount = $state<number | null>(null);
let dailyCount = $state(DEFAULT_SETTINGS.resurface.dailyCount);
let currentThemePalette = $state<ThemePaletteId>("teal");
let includeDone = $state(DEFAULT_SETTINGS.resurface.includeDoneHighlights);
let inboxQuota = $state(DEFAULT_SETTINGS.inboxQuota);
let staleDays = $state(DEFAULT_SETTINGS.staleDays);
let boardBusy = $state(false);
let rebuildBusy = $state(false);
let aiChannel = $state<"siyuan" | "custom">(DEFAULT_SETTINGS.ai.channel);
let customBaseUrl = $state(DEFAULT_SETTINGS.ai.customBaseUrl);
let customModel = $state(DEFAULT_SETTINGS.ai.customModel);
const customEndpointSecurity = $derived(inspectCustomEndpointSecurity(customBaseUrl));
let customSecretName = $state(DEFAULT_SETTINGS.ai.customSecretName);
let testBusy = $state(false);
let checkinEnabled = $state(DEFAULT_SETTINGS.integration.checkinEnabled);
let checkinItemId = $state(DEFAULT_SETTINGS.integration.checkinItemId);
let bridgeWriteEnabled = $state(DEFAULT_SETTINGS.integration.bridgeWriteEnabled);
let dailyNoteEnabled = $state(DEFAULT_SETTINGS.integration.dailyNoteEnabled);
let checkinItems = $state<CheckinItemOption[]>([]);
let checkinLoadError = $state(false);
let checkinLoading = $state(false);
let readerOpenInTab = $state(DEFAULT_SETTINGS.reader.openInTab);
let readerMode = $state<"read" | "edit">(DEFAULT_SETTINGS.reader.defaultMode);
let originalSettings = $state<GleanSettings>(cloneSettings(DEFAULT_SETTINGS));
let saveBusy = $state(false);
let validationField = $state("");
let validationError = $state("");
let confirmDiscardOpen = $state(false);
let keepEditingButton = $state<HTMLButtonElement>();
let discardButton = $state<HTMLButtonElement>();
let saveButton = $state<HTMLButtonElement>();
let settingsRoot = $state<HTMLElement | null>(null);
let showNewbieHint = $state(false);
let dismissHintBusy = $state(false);
let exportBusy = $state<"csv" | "diagnostic" | "markdownArchive" | "">("");
let exportError = $state("");
let lastExport = $state<"csv" | "diagnostic" | "markdownArchive" | "">("");
let ecosystemBadgeText = $state(typeof lvEcosystem !== "undefined" ? lvEcosystem.getStatusBadgeText() : "");

let aiLog = $state<AiLogEntry[] | null>(null);
let aiLogLoading = $state(false);
let aiLogError = $state(false);
let draftDirty = $derived(!settingsEqual(originalSettings, buildDraftSettings()));
/** 锚点笔记本筛选（T-3314）：按名称子串过滤 chips，大小写不敏感；清空搜索框即恢复全量。 */
const filteredNotebooks = $derived.by(() => {
    const query = notebookFilter.trim().toLocaleLowerCase();
    if (!query) return notebooks;
    return notebooks.filter((notebook) => notebook.name.toLocaleLowerCase().includes(query));
});

/** 长任务分类（备份恢复/闪卡恢复/AI 标签扫描）首次访问后保持挂载：切分类只隐藏不卸载，避免进行中的任务被静默中止（T-3315）。 */
let dataVisited = $state(false);
let maintenanceVisited = $state(false);

function selectSection(id: SettingsSectionId): void {
    activeSection = id;
    if (id === "data") dataVisited = true;
    if (id === "maintenance") maintenanceVisited = true;
}

/** ARIA tabs 键盘模式：左右（竖排时上下）方向键在分类间移动焦点并激活，Home/End 跳两端。 */
function onNavKeydown(event: KeyboardEvent): void {
    const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const tabs = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (backward ? -1 : 1) + tabs.length) % tabs.length;
    const target = tabs[next];
    if (!target) return;
    target.focus();
    selectSection(SETTINGS_SECTIONS[next].id);
}

function clearAnchorNotebooks(): void {
    anchorNotebooks = [];
}

function canCloseSettings(): boolean {
    if (saveBusy) return false;
    if (confirmResetOpen) return false;
    if (confirmDiscardOpen) return false;
    if (draftDirty) {
        confirmDiscardOpen = true;
        void tick().then(() => keepEditingButton?.focus());
        return false;
    }
    return true;
}

let confirmResetOpen = $state(false);
let cancelResetButton = $state<HTMLButtonElement | null>(null);

function keepEditing(): void {
    confirmDiscardOpen = false;
    void tick().then(() => saveButton?.focus());
}

function discardAndClose(): void {
    if (saveBusy) return;
    loadDraft(originalSettings);
    confirmDiscardOpen = false;
    onClose?.();
}

function handleConfirmKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        keepEditing();
    } else if (event.key === "Enter") {
        if (event.target === discardButton) {
            event.preventDefault();
            event.stopPropagation();
            discardAndClose();
        } else if (event.target === keepEditingButton) {
            event.preventDefault();
            event.stopPropagation();
            keepEditing();
        }
    }
}

function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return;

    if (confirmDiscardOpen) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            keepEditing();
        }
        return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (!saveBusy && draftDirty) {
            event.preventDefault();
            event.stopPropagation();
            void save();
        }
        return;
    }

    if (event.key === "Escape") {
        if (notebookFilter && document.activeElement?.classList.contains("glean-nb-search__input")) {
            event.preventDefault();
            event.stopPropagation();
            notebookFilter = "";
            return;
        }
        if (draftDirty) {
            event.preventDefault();
            event.stopPropagation();
            confirmDiscardOpen = true;
            void tick().then(() => keepEditingButton?.focus());
            return;
        }
        if (canCloseSettings()) {
            event.preventDefault();
            event.stopPropagation();
            onClose?.();
        }
    }
}

$effect(() => {
    const root = settingsRoot;
    if (!root) return;
    const onEscape = (_event: KeyboardEvent) => {
        if (confirmResetOpen) {
            confirmResetOpen = false;
            return true;
        }
        if (confirmDiscardOpen) {
            keepEditing();
            return true;
        }
        if (notebookFilter && document.activeElement?.classList.contains("glean-nb-search__input")) {
            notebookFilter = "";
            return true;
        }
        if (draftDirty) {
            confirmDiscardOpen = true;
            void tick().then(() => keepEditingButton?.focus());
            return true;
        }
        return false;
    };
    return installEscapeHandler(root, onEscape);
});

let mounted = false;

onMount(() => {
    let active = true;
    const unregisterCloseGuard = registerCloseGuard?.(canCloseSettings);
    mounted = true;
    ecosystemBadgeText = typeof lvEcosystem !== "undefined" ? lvEcosystem.getStatusBadgeText() : "";
    originalSettings = cloneSettings(facade.settings);
    loadDraft(originalSettings);
    void loadUiPrefs(facade.pluginInstance).then((prefs) => {
        if (active) {
            showNewbieHint = !prefs.onboardingDone && !prefs.onboardingHintDismissed;
            currentThemePalette = prefs.themePalette || "teal";
        }
    }).catch(() => undefined);
    void loadNotebookOptions();
    if (originalSettings.integration.checkinEnabled) {
        void loadCheckinItems();
    }
    let usageRequest = 0;
    const refreshUsage = () => {
        const request = ++usageRequest;
        // 刷新期间保留已知用量，读取失败后再降级为未知。
        void usageToday(facade.pluginInstance).then((count) => {
            if (active && request === usageRequest) usageCount = count;
        }).catch(() => {
            if (active && request === usageRequest) usageCount = null;
        });
    };
    refreshUsage();
    document.addEventListener("glean:data-changed", refreshUsage);
    return () => {
        active = false;
        mounted = false;
        unregisterCloseGuard?.();
        document.removeEventListener("glean:data-changed", refreshUsage);
    };
});

async function selectThemePalette(id: ThemePaletteId): Promise<void> {
    currentThemePalette = id;
    applyThemePaletteToDom(null, id);
    try {
        await saveUiPrefs(facade.pluginInstance, { themePalette: id });
        facade.notifyDataChanged();
    } catch (error) {
        console.warn("[glean] 保存主题色彩失败:", error);
    }
}

async function loadNotebookOptions(): Promise<void> {
    if (notebookLoading) return;
    notebookLoading = true;
    notebookLoadError = false;
    try {
        const items = await listNotebooks();
        if (mounted) notebooks = items;
    } catch {
        if (mounted) notebookLoadError = true;
    } finally {
        if (mounted) notebookLoading = false;
    }
}

async function loadCheckinItems(): Promise<void> {
    if (checkinLoading) return;
    checkinLoading = true;
    checkinLoadError = false;
    try {
        const items = await listCheckinItems();
        if (mounted) checkinItems = items;
    } catch {
        if (mounted) checkinLoadError = true;
    } finally {
        if (mounted) checkinLoading = false;
    }
}

function toggleNotebook(id: string) {
    anchorNotebooks = anchorNotebooks.includes(id)
        ? anchorNotebooks.filter((item) => item !== id)
        : [...anchorNotebooks, id];
}

function loadDraft(settings: GleanSettings) {
    anchorNotebooks = [...settings.anchorNotebooks];
    snapshotOnCapture = settings.snapshotOnCapture;
    aiEnrichMode = settings.ai.enrichMode;
    aiDailyCap = settings.ai.enrichDailyCap;
    aiDedup = settings.ai.dedupOnEnrich;
    aiRelated = settings.ai.relatedWhileReading;
    aiFormatting = settings.ai.formattingEnabled;
    aiAuthorSuggestion = settings.ai.authorSuggestionEnabled;
    aiQuestionCard = settings.ai.questionCardEnabled;
    aiArticleQuestion = settings.ai.articleQuestionEnabled;
    aiActions = settings.ai.presetActions;
    dailyCount = settings.resurface.dailyCount;
    includeDone = settings.resurface.includeDoneHighlights;
    inboxQuota = settings.inboxQuota;
    staleDays = settings.staleDays;
    aiChannel = settings.ai.channel;
    customBaseUrl = settings.ai.customBaseUrl;
    customModel = settings.ai.customModel;
    customSecretName = settings.ai.customSecretName;
    checkinEnabled = settings.integration.checkinEnabled;
    checkinItemId = settings.integration.checkinItemId;
    bridgeWriteEnabled = settings.integration.bridgeWriteEnabled;
    dailyNoteEnabled = settings.integration.dailyNoteEnabled;
    readerOpenInTab = settings.reader.openInTab;
    readerMode = settings.reader.defaultMode;
}

function clearResolvedValidation(): void {
    if (!validationField || validateDraft(validationField)) return;
    validationField = "";
    validationError = "";
}

$effect(clearResolvedValidation);

function validateDraft(field?: string): { field: string; section: SettingsSectionId; message: string } | null {
    const numeric: Array<[string, SettingsSectionId, number, number, number]> = [
        ["aiDailyCap", "ai", aiDailyCap, 0, 500],
        ["dailyCount", "resurface", dailyCount, 1, 10],
        ["inboxQuota", "resurface", inboxQuota, 5, 1000],
        ["staleDays", "resurface", staleDays, 7, 3650],
    ];
    const invalid = numeric.find(([key, , value, min, max]) => (!field || field === key) && (!Number.isFinite(value) || value < min || value > max));
    if (invalid) return { field: invalid[0], section: invalid[1], message: t(i18n, "settings.invalidNumber") };
    if (aiChannel === "custom") {
        const urlLower = customBaseUrl.trim().toLowerCase();
        if ((!field || field === "customBaseUrl") && (!urlLower.startsWith("http://") && !urlLower.startsWith("https://"))) return { field: "customBaseUrl", section: "aiChannel", message: t(i18n, "settings.customBaseUrlInvalid") };
        if ((!field || field === "customModel") && !customModel.trim()) return { field: "customModel", section: "aiChannel", message: t(i18n, "settings.customModelRequired") };
        if ((!field || field === "customSecretName") && !customSecretName.trim()) return { field: "customSecretName", section: "aiChannel", message: t(i18n, "settings.customSecretRequired") };
    }
    return null;
}

function buildDraftSettings(): GleanSettings {
    return normalizeSettings({
        ...originalSettings,
        anchorNotebooks: [...anchorNotebooks],
        snapshotOnCapture,
        ai: {
            ...originalSettings.ai,
            enrichMode: aiEnrichMode,
            enrichDailyCap: aiDailyCap,
            dedupOnEnrich: aiDedup,
            relatedWhileReading: aiRelated,
            formattingEnabled: aiFormatting,
            authorSuggestionEnabled: aiAuthorSuggestion,
            questionCardEnabled: aiQuestionCard,
            articleQuestionEnabled: aiArticleQuestion,
            presetActions: aiActions,
            channel: aiChannel,
            customBaseUrl,
            customModel,
            customSecretName,
        },
        resurface: { dailyCount, includeDoneHighlights: includeDone },
        inboxQuota,
        staleDays,
        // migrateBatchSize 改在迁移器内调整（UX 审计 #7），不经设置草稿编辑。
        integration: { checkinEnabled, checkinItemId, bridgeWriteEnabled, dailyNoteEnabled },
        reader: { openInTab: readerOpenInTab, defaultMode: readerMode },
    });
}

async function save() {
    if (saveBusy) return;
    const validation = validateDraft();
    if (validation) {
        validationField = validation.field;
        validationError = validation.message;
        selectSection(validation.section);
        await tick();
        settingsRoot?.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.focus();
        return;
    }
    validationField = "";
    validationError = "";
    saveBusy = true;
    try {
        const draft = buildDraftSettings();
        await facade.updateSettings(mergeSettingsDraft(facade.settings, draft), { expected: originalSettings });
        originalSettings = cloneSettings(facade.settings);
        loadDraft(originalSettings);
        showMessage(t(i18n, "settings.saved"), 2500);
        saveBusy = false;
        onClose?.();
    } catch (error) {
        if (error instanceof SettingsConflictError) {
            // 其他窗口已修改设置：以磁盘最新值重新对账，保留当前草稿，请用户核对后再保存
            try {
                facade.settings = await loadSettings(facade.pluginInstance);
                originalSettings = cloneSettings(facade.settings);
                facade.notifyDataChanged();
                showMessage(t(i18n, "settings.conflict"), 5000);
            } catch (reloadError) {
                console.warn("[glean] 设置冲突后重读失败:", reloadError);
                showMessage(t(i18n, "settings.saveFailed"), 5000);
            }
        } else {
            showMessage(`${t(i18n, "settings.saveFailed")}: ${String(error).slice(0, 120)}`, 5000);
        }
    } finally {
        saveBusy = false;
    }
}

async function dismissNewbieHint() {
    if (dismissHintBusy || !showNewbieHint) return;
    dismissHintBusy = true;
    try {
        await saveUiPrefs(facade.pluginInstance, { onboardingHintDismissed: true });
        showNewbieHint = false;
    } catch (error) {
        showMessage(`${t(i18n, "settings.saveFailed")}: ${String(error).slice(0, 120)}`, 5000);
    } finally {
        dismissHintBusy = false;
    }
}

function exportPortableSettings(): void {
    const draft = buildDraftSettings();
    const json = JSON.stringify(draft, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glean-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage(t(i18n, "settings.configExported"), 2500);
}

function importPortableSettings(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result));
            const normalized = normalizeSettings(parsed);
            loadDraft(normalized);
            showMessage(t(i18n, "settings.configImported"), 3000);
        } catch {
            showMessage(t(i18n, "settings.configImportFailed"), 3000);
        } finally {
            input.value = "";
        }
    };
    reader.readAsText(file);
}

function cancel() {
    if (!canCloseSettings()) return;
    loadDraft(originalSettings);
    onClose?.();
}

function resetDefaults() {
    loadDraft(cloneSettings(DEFAULT_SETTINGS));
    confirmResetOpen = false;
}

function toggleAi(key: "dedup" | "related" | "actions") {
    if (key === "dedup") aiDedup = !aiDedup;
    else if (key === "related") aiRelated = !aiRelated;
    else aiActions = !aiActions;
}

function setMode(mode: "off" | "manual" | "auto") {
    aiEnrichMode = mode;
}

function setChannel(channel: "siyuan" | "custom") {
    aiChannel = channel;
}

async function testChannel() {
    if (testBusy) return;
    testBusy = true;
    try {
        const result = await testDirectChannel(facade.pluginInstance, buildDraftSettings());
        showMessage(
            result.ok ? t(i18n, "ai.testOk", { message: result.message }) : t(i18n, "ai.testFail", { message: result.message }),
            4500
        );
    } catch {
        console.warn("[glean] AI 通道测试异常");
        showMessage(t(i18n, "ai.testError"), 4500);
    } finally {
        testBusy = false;
    }
}

async function doRebuildIndex() {
    if (rebuildBusy) return;
    rebuildBusy = true;
    try {
        await rebuildIndex(facade.pluginInstance, buildDraftSettings());
        showMessage(t(i18n, "msg.indexRebuilt"), 2500);
    } catch (error) {
        console.warn("[glean] 索引重建失败:", error);
        showMessage(t(i18n, "msg.actionFailed"), 5000);
    } finally {
        rebuildBusy = false;
    }
}

function downloadBlob(filename: string, content: BlobPart, mime: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadText(filename: string, content: string, mime: string): void {
    downloadBlob(filename, content, mime);
}

async function exportData(kind: "csv" | "diagnostic" | "markdownArchive"): Promise<void> {
    if (exportBusy) return;
    exportBusy = kind;
    lastExport = kind;
    exportError = "";
    try {
        if (kind === "csv") {
            const csv = await exportLibraryCsv(facade.pluginInstance, facade.settings);
            downloadText("siyuan-glean-library.csv", csv, "text/csv;charset=utf-8");
        } else if (kind === "diagnostic") {
            const diagnostic = await exportAnonymousDiagnostic(facade.pluginInstance, facade.settings, getFrontend());
            downloadText("siyuan-glean-diagnostic.json", diagnostic, "application/json;charset=utf-8");
        } else {
            const parts = await exportLibraryMarkdownArchive(facade.pluginInstance, facade.settings);
            if (parts.length === 0) throw new Error("没有可导出的文章");
            for (const part of parts) downloadBlob(part.filename, part.bytes as unknown as BlobPart, "application/zip");
            const failed = parts.reduce((count, part) => count + part.failedCount, 0);
            showMessage(t(i18n, failed > 0 ? "settings.exportMarkdownArchivePartial" : "settings.exportMarkdownArchiveDone", { n: parts.length, failed }), 5000);
        }
    } catch (error) {
        console.warn("[glean] 读库导出失败:", error);
        exportError = t(i18n, "msg.actionFailed");
        showMessage(exportError, 5000);
    } finally {
        exportBusy = "";
    }
}

async function toggleCheckin() {
    if (!checkinEnabled) {
        checkinEnabled = true;
        await loadCheckinItems();
        if (checkinLoadError) checkinEnabled = false;
        return;
    }
    checkinEnabled = false;
}

async function toggleAiLog() {
    if (aiLogLoading) return;
    if (aiLog !== null && !aiLogError) {
        aiLog = null;
        aiLogError = false;
        return;
    }
    aiLogLoading = true;
    aiLogError = false;
    try {
        aiLog = await loadAiLog(facade.pluginInstance);
    } catch {
        aiLog = [];
        aiLogError = true;
    } finally {
        aiLogLoading = false;
    }
}

async function doMountBoard() {
    boardBusy = true;
    try {
        const result = await bindAllClipsToLibrary(facade.pluginInstance, buildDraftSettings());
        showMessage(t(i18n, "board.projected", { bound: result.bound, synced: result.synced, failed: result.failures.length }), 3500);
    } catch (error) {
        console.warn("[glean] 挂载读库看板失败:", error);
        showMessage(t(i18n, "msg.actionFailed"), 5000);
    } finally {
        boardBusy = false;
    }
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section class="glean-settings" bind:this={settingsRoot} aria-labelledby={titleId} aria-busy={saveBusy || testBusy || boardBusy || rebuildBusy || Boolean(exportBusy) || dismissHintBusy || notebookLoading || checkinLoading || aiLogLoading}>
    {#if validationError}<div class="glean-load-error" role="alert" aria-live="assertive">{validationError}</div>{/if}
    <div class="glean-settings__layout">
        <nav class="glean-settings__nav" aria-labelledby={navLabelId}>
            <div class="glean-settings__brand">
                <div class="glean-brand__mark glean-settings__brand-mark">
                    <svg aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                </div>
                <div class="glean-settings__brand-copy">
                    <h2 id={titleId} class="glean-settings__brand-title">{t(i18n, "settings.title")}</h2>
                    <div class="glean-settings__brand-sub">{t(i18n, "settings.sovereigntyNote")}</div>
                </div>
            </div>
            <div class="glean-settings__nav-list" id={navLabelId} role="tablist" aria-label={t(i18n, "settings.navLabel")} tabindex="-1" onkeydown={onNavKeydown}>
                {#each SETTINGS_SECTIONS as section (section.id)}
                    <button
                        id={`${idPrefix}-tab-${section.id}`}
                        class="glean-settings__tab"
                        class:glean-settings__tab--on={activeSection === section.id}
                        role="tab"
                        tabindex={activeSection === section.id ? 0 : -1}
                        aria-selected={activeSection === section.id}
                        aria-controls={panelId}
                        disabled={saveBusy}
                        onclick={() => selectSection(section.id)}
                    >
                        <svg class="glean-icon glean-icon--sm glean-settings__tab-icon" aria-hidden="true"><use href={section.iconHref} /></svg>
                        <span class="glean-settings__tab-label">{t(i18n, section.labelKey)}</span>
                        {#if section.id === "workspace" && anchorNotebooks.length > 0}
                            <span class="glean-settings__tab-badge">{anchorNotebooks.length}</span>
                        {/if}
                    </button>
                {/each}
            </div>
            <div class="glean-settings__nav-ecosystem" title={ecosystemBadgeText}>
                <span class="glean-settings__ecosystem-badge">{ecosystemBadgeText}</span>
            </div>
        </nav>
        <div id={panelId} class="glean-settings__content" role="tabpanel" aria-labelledby={`${idPrefix}-tab-${activeSection}`} tabindex="-1" inert={saveBusy}>
            <header class="glean-settings__pagehead">
                <div class="glean-settings__page-title" role="heading" aria-level="2">{t(i18n, activeSectionMeta.titleKey)}</div>
                <div class="glean-settings__page-desc">{t(i18n, activeSectionMeta.descKey)}</div>
            </header>
            {#if showNewbieHint && activeSection === "workspace"}
                <div class="glean-set-group glean-settings__newbie-hint glean-settings__newbie-banner" role="status">
                    <div class="glean-settings__newbie-banner-icon" aria-hidden="true">
                        <svg class="glean-icon"><use href="#iconGleanWheat" /></svg>
                    </div>
                    <div class="glean-settings__newbie-banner-body">
                        <div class="glean-settings__newbie-banner-text">{t(i18n, "settings.newbieHint")}</div>
                        <div class="glean-settings__newbie-banner-actions">
                            <button class="glean-btn glean-btn--pri glean-settings__newbie-hint-open" type="button" onclick={() => facade.openOnboarding()}>
                                {t(i18n, "settings.openOnboarding")}
                            </button>
                            <button class="glean-linkish glean-settings__newbie-hint-dismiss" aria-busy={dismissHintBusy} disabled={dismissHintBusy} onclick={() => void dismissNewbieHint()}>
                                {t(i18n, "settings.dismissNewbieHint")}
                            </button>
                        </div>
                    </div>
                </div>
            {/if}
            {#if activeSection === "workspace" && !showNewbieHint}
                <button class="glean-linkish glean-settings__guide-link" type="button" onclick={() => facade.openOnboarding()}>
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                    {t(i18n, "settings.openOnboarding")}
                </button>
            {/if}
            {#if activeSection === "workspace"}
    <div class="glean-settings__section glean-settings__section--core glean-settings__section--workspace">
        <div class="glean-set-group glean-theme-palette-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.themePalette")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.themePaletteDesc")}</div>
                </div>
            </div>
            <div class="glean-palette-grid" role="radiogroup" aria-label={t(i18n, "settings.themePalette")}>
                {#each THEME_PALETTES as palette, idx (palette.id)}
                    <button
                        type="button"
                        class="glean-palette-card"
                        class:glean-palette-card--active={currentThemePalette === palette.id}
                        role="radio"
                        aria-checked={currentThemePalette === palette.id}
                        tabindex={currentThemePalette === palette.id ? 0 : -1}
                        onclick={() => void selectThemePalette(palette.id)}
                        onkeydown={(e) => {
                            if (e.key !== "ArrowRight" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowUp") return;
                            e.preventDefault();
                            const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                            const nextIdx = (idx + delta + THEME_PALETTES.length) % THEME_PALETTES.length;
                            const nextPalette = THEME_PALETTES[nextIdx];
                            void selectThemePalette(nextPalette.id);
                            const cards = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                            cards?.[nextIdx]?.focus();
                        }}
                    >
                        <div class="glean-palette-preview" style="background: linear-gradient(135deg, {palette.brand} 0%, {palette.brandHover} 100%);">
                            <span class="glean-palette-dot" style="background: {palette.accentWheat};"></span>
                        </div>
                        <div class="glean-palette-info">
                            <div class="glean-palette-name">{t(i18n, palette.nameKey)}</div>
                            <div class="glean-palette-desc">{t(i18n, palette.descriptionKey)}</div>
                        </div>
                        {#if currentThemePalette === palette.id}
                            <span class="glean-palette-check" aria-hidden="true"><svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanCheck" /></svg></span>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>

        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.anchorNotebooks")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.anchorNotebooksDesc")}</div>
                </div>
            </div>
            <div class="glean-nb-tools">
                <div class="glean-nb-search">
                    <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    <input
                        class="glean-nb-search__input"
                        type="text"
                        placeholder={t(i18n, "settings.anchorSearch")}
                        aria-label={t(i18n, "settings.anchorSearch")}
                        bind:value={notebookFilter}
                        onkeydown={(e) => {
                            if (e.key === "Escape" && notebookFilter) {
                                e.preventDefault();
                                e.stopPropagation();
                                notebookFilter = "";
                            }
                        }}
                    />
                    {#if notebookFilter}
                        <button class="glean-linkish glean-nb-search__clear" type="button" aria-label={t(i18n, "settings.anchorSearchClear")} onclick={() => (notebookFilter = "")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                    {/if}
                </div>
                {#if !notebookLoading && !notebookLoadError}
                    <span class="glean-nb-count" role="status">{t(i18n, "settings.anchorSelected", { n: anchorNotebooks.length, total: notebooks.length })}</span>
                    {#if anchorNotebooks.length > 0}
                        <button class="glean-linkish" type="button" onclick={clearAnchorNotebooks}>{t(i18n, "settings.anchorClear")}</button>
                    {/if}
                {/if}
            </div>
            <div class="glean-nb-wrap" role="group" aria-label={t(i18n, "settings.anchorNotebooks")}>
                {#if notebookLoading}
                    <span class="glean-settings__empty" role="status">{t(i18n, "panel.loading")}</span>
                {:else if notebookLoadError}
                    <span class="glean-settings__empty glean-settings__error" role="alert">{t(i18n, "settings.notebookLoadFailed")}</span>
                    <button class="glean-btn glean-btn--ghost" type="button" onclick={() => void loadNotebookOptions()}>{t(i18n, "action.retry")}</button>
                {:else}
                {#each filteredNotebooks as notebook (notebook.id)}
                    <button
                        class="glean-nb"
                        class:glean-nb--on={anchorNotebooks.includes(notebook.id)}
                        aria-pressed={anchorNotebooks.includes(notebook.id)}
                        onclick={() => toggleNotebook(notebook.id)}
                    >
                        {#if anchorNotebooks.includes(notebook.id)}
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                        {/if}
                        <span>{notebook.name}</span>
                    </button>
                {/each}
                {#if notebooks.length === 0}
                    <span class="glean-settings__empty" role="status">{t(i18n, "settings.anchorEmpty")}</span>
                {:else if filteredNotebooks.length === 0}
                    <span class="glean-settings__empty" role="status">{t(i18n, "settings.anchorNoMatch")}</span>
                {/if}
                {/if}
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.snapshotOnCapture")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.snapshotOnCaptureHint")}</div>
                </div>
                <button class="glean-sw" class:glean-sw--on={snapshotOnCapture} aria-label={t(i18n, "settings.snapshotOnCapture")} aria-pressed={snapshotOnCapture} onclick={() => { snapshotOnCapture = !snapshotOnCapture; }}></button>
            </div>
        </div>
    </div>

    {/if}
    {#if activeSection === "ai"}
    <div class="glean-settings__section glean-settings__section--core" aria-labelledby={`${idPrefix}-ai-title`}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.aiEnrichMode")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.aiEnrichModeDesc")}</div>
                </div>
            </div>
            <div class="glean-set-row glean-seg-row">
                <div class="glean-seg" role="group" aria-label={t(i18n, "settings.aiEnrichMode")}>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={aiEnrichMode === "off"}
                        aria-pressed={aiEnrichMode === "off"}
                        onclick={() => setMode("off")}
                    >{t(i18n, "settings.modeOff")}</button>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={aiEnrichMode === "manual"}
                        aria-pressed={aiEnrichMode === "manual"}
                        onclick={() => setMode("manual")}
                    >{t(i18n, "settings.modeManual")}</button>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={aiEnrichMode === "auto"}
                        aria-pressed={aiEnrichMode === "auto"}
                        onclick={() => setMode("auto")}
                    >{t(i18n, "settings.modeAuto")}</button>
                </div>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.aiDailyCap")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.aiDailyCapDesc")}</div>
                </div>
                <input class="glean-mini-input" type="number" inputMode="numeric" min="0" max="500" aria-invalid={validationField === "aiDailyCap"} aria-label={t(i18n, "settings.aiDailyCap")} bind:value={aiDailyCap} />
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.aiTodayUsage")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.aiTodayUsageDesc")}</div>
                </div>
                <span class="chip glean-chip glean-settings__usage">{usageCount ?? t(i18n, "settings.usageUnknown")}{usageCount !== null && aiDailyCap > 0 ? " / " + aiDailyCap : ""}</span>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.aiDedup")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.aiDedupDesc")}</div>
                </div>
                <button class="glean-sw" class:glean-sw--on={aiDedup} aria-label={t(i18n, "settings.aiDedup")} aria-pressed={aiDedup} onclick={() => void toggleAi("dedup")}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">{t(i18n, "settings.aiRelated")}</div>
                <button class="glean-sw" class:glean-sw--on={aiRelated} aria-label={t(i18n, "settings.aiRelated")} aria-pressed={aiRelated} onclick={() => void toggleAi("related")}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "formatting.enable")}
                    <div class="glean-set-row__desc">{t(i18n, "formatting.enableHint")}</div>
                </div>
                <button class="glean-sw" class:glean-sw--on={aiFormatting} aria-label={t(i18n, "formatting.enable")} aria-pressed={aiFormatting} onclick={() => { aiFormatting = !aiFormatting; }}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">{t(i18n, "settings.aiSummaryActions")}</div>
                <button class="glean-sw" class:glean-sw--on={aiActions} aria-label={t(i18n, "settings.aiSummaryActions")} aria-pressed={aiActions} onclick={() => void toggleAi("actions")}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "author.suggestion.enable")}
                    <div class="glean-set-row__desc">{t(i18n, "author.suggestion.enableHint")}</div>
                </div>
                <button type="button" role="switch" class="glean-sw" class:glean-sw--on={aiAuthorSuggestion} aria-label={t(i18n, "author.suggestion.enable")} aria-checked={aiAuthorSuggestion} onclick={() => { aiAuthorSuggestion = !aiAuthorSuggestion; }}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "flashcard.aiEnable")}
                    <div class="glean-set-row__desc">{t(i18n, "flashcard.aiEnableHint")}</div>
                </div>
                <button type="button" role="switch" class="glean-sw" class:glean-sw--on={aiQuestionCard} aria-label={t(i18n, "flashcard.aiEnable")} aria-checked={aiQuestionCard} onclick={() => { aiQuestionCard = !aiQuestionCard; }}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "reader.articleQuestion.enable")}
                    <div class="glean-set-row__desc">{t(i18n, "reader.articleQuestion.enableHint")}</div>
                </div>
                <button type="button" role="switch" class="glean-sw" class:glean-sw--on={aiArticleQuestion} aria-label={t(i18n, "reader.articleQuestion.enable")} aria-checked={aiArticleQuestion} onclick={() => { aiArticleQuestion = !aiArticleQuestion; }}></button>
            </div>
        </div>
    </div>

    {/if}
    {#if activeSection === "aiChannel"}
    <div class="glean-settings__section glean-settings__section--advanced" aria-labelledby={`${idPrefix}-ai-channel-title`}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.aiChannel")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.aiChannelDesc")}</div>
                </div>
            </div>
            <div class="glean-set-row glean-seg-row">
                <div class="glean-seg" role="group" aria-label={t(i18n, "settings.aiChannel")}>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={aiChannel === "siyuan"}
                        aria-pressed={aiChannel === "siyuan"}
                        onclick={() => setChannel("siyuan")}
                    >{t(i18n, "settings.channelSiyuan")}</button>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={aiChannel === "custom"}
                        aria-pressed={aiChannel === "custom"}
                        onclick={() => setChannel("custom")}
                    >{t(i18n, "settings.channelCustom")}</button>
                </div>
            </div>
            {#if aiChannel === "custom"}
                <div class="glean-set-row">
                    <div class="glean-set-row__lb">{t(i18n, "settings.customBaseUrl")}</div>
                    <input class="glean-mini-input glean-settings__wide-input" aria-label={t(i18n, "settings.customBaseUrl")} aria-invalid={validationField === "customBaseUrl"} placeholder="https://…/v1" bind:value={customBaseUrl} />
                </div>
                {#if customEndpointSecurity.isPlaintextHttp}
                    <div class="glean-set-row" role="alert">
                        <span class="glean-settings__error">{t(i18n, "settings.customBaseUrlInsecure")}</span>
                    </div>
                {/if}
                <div class="glean-set-row">
                    <div class="glean-set-row__lb">{t(i18n, "settings.customModel")}</div>
                    <input class="glean-mini-input glean-settings__wide-input" aria-label={t(i18n, "settings.customModel")} aria-invalid={validationField === "customModel"} placeholder="free-model" bind:value={customModel} />
                </div>
                <div class="glean-set-row">
                    <div class="glean-set-row__lb">
                        {t(i18n, "settings.customSecretName")}
                        <div class="glean-set-row__desc">{t(i18n, "settings.customSecretDesc")}</div>
                    </div>
                    <input class="glean-mini-input glean-settings__wide-input" aria-label={t(i18n, "settings.customSecretName")} aria-invalid={validationField === "customSecretName"} bind:value={customSecretName} />
                </div>
                <div class="glean-set-row">
                    <div class="glean-set-row__lb">{t(i18n, "settings.testConnection")}</div>
                    <button class="glean-btn glean-action-btn" aria-busy={testBusy} disabled={testBusy} onclick={() => void testChannel()}>
                        {testBusy ? t(i18n, "panel.loading") : t(i18n, "settings.testConnection")}
                    </button>
                </div>
            {/if}
        </div>
    </div>

    {/if}
    {#if activeSection === "resurface"}
    <div class="glean-settings__section glean-settings__section--core" aria-labelledby={`${idPrefix}-resurface-title`}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">{t(i18n, "settings.resurfaceCount")}</div>
                <input class="glean-mini-input" type="number" inputMode="numeric" min="1" max="10" aria-invalid={validationField === "dailyCount"} aria-label={t(i18n, "settings.resurfaceCount")} bind:value={dailyCount} />
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">{t(i18n, "settings.resurfaceIncludeDone")}</div>
                <button class="glean-sw" class:glean-sw--on={includeDone} aria-label={t(i18n, "settings.resurfaceIncludeDone")} aria-pressed={includeDone} onclick={() => { includeDone = !includeDone; }}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">{t(i18n, "settings.inboxQuota")}</div>
                <input class="glean-mini-input" type="number" inputMode="numeric" min="5" max="1000" aria-invalid={validationField === "inboxQuota"} aria-label={t(i18n, "settings.inboxQuota")} bind:value={inboxQuota} />
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">{t(i18n, "settings.staleDays")}</div>
                <input class="glean-mini-input" type="number" inputMode="numeric" min="7" max="3650" aria-invalid={validationField === "staleDays"} aria-label={t(i18n, "settings.staleDays")} bind:value={staleDays} />
            </div>
        </div>
    </div>

    {/if}
    {#if dataVisited}
    <div class="glean-settings__section glean-settings__section--maintenance" style:display={activeSection === "data" ? "" : "none"}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "board.mountTitle")}
                    <div class="glean-set-row__desc">{t(i18n, "board.mountDesc")}</div>
                </div>
                <button class="glean-btn glean-btn--pri glean-action-btn" aria-busy={boardBusy} disabled={boardBusy} onclick={() => void doMountBoard()}>
                    {boardBusy ? t(i18n, "panel.loading") : t(i18n, "board.mountAction")}
                </button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.exportLibraryCsv")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.exportLibraryCsvDesc")}</div>
                </div>
                <button class="glean-btn glean-action-btn" aria-busy={exportBusy === "csv"} disabled={Boolean(exportBusy)} onclick={() => void exportData("csv")}>
                    {exportBusy === "csv" ? t(i18n, "settings.exporting") : t(i18n, "settings.exportLibraryCsv")}
                </button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.exportDiagnostic")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.exportDiagnosticDesc")}</div>
                </div>
                <button class="glean-btn glean-action-btn" aria-busy={exportBusy === "diagnostic"} disabled={Boolean(exportBusy)} onclick={() => void exportData("diagnostic")}>
                    {exportBusy === "diagnostic" ? t(i18n, "settings.exporting") : t(i18n, "settings.exportDiagnostic")}
                </button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.exportMarkdownArchive")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.exportMarkdownArchiveDesc")}</div>
                </div>
                <button class="glean-btn glean-action-btn" aria-busy={exportBusy === "markdownArchive"} disabled={Boolean(exportBusy)} onclick={() => void exportData("markdownArchive")}>
                    {exportBusy === "markdownArchive" ? t(i18n, "settings.exporting") : t(i18n, "settings.exportMarkdownArchive")}
                </button>
            </div>
            {#if exportError}
                <div class="glean-set-row" role="alert">
                    <span class="glean-settings__error">{exportError}</span>
                    <button class="glean-btn glean-btn--ghost" disabled={Boolean(exportBusy)} onclick={() => lastExport && void exportData(lastExport)}>{t(i18n, "action.retry")}</button>
                </div>
            {/if}
        </div>
    </div>

    {/if}
    {#if dataVisited}
    <div class="glean-settings__section glean-settings__section--maintenance glean-settings__section--data" style:display={activeSection === "data" ? "" : "none"}>
        <div class="glean-set-group">
            <div class="glean-settings__extension-card">
                <BackupPanel {facade} settingsDirty={draftDirty} settingsBusy={saveBusy} onPreferencesRestored={() => { originalSettings = cloneSettings(facade.settings); loadDraft(originalSettings); }} />
            </div>
            <div class="glean-settings__extension-card glean-settings__extension-card--recovery">
                <FlashcardRecoveryPanel {facade} />
            </div>
            <div class="glean-set-row glean-settings__import-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "import.title")}
                    <div class="glean-set-row__desc">{t(i18n, "import.entryDesc")}</div>
                </div>
                <button class="glean-btn glean-btn--pri glean-action-btn" onclick={() => facade.openImport()}>
                    {t(i18n, "import.entryAction")}
                </button>
            </div>
            <div class="glean-set-row glean-settings__import-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.portableConfig")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.portableConfigDesc")}</div>
                </div>
                <div class="glean-set-row__actions" style="display: flex; gap: 8px;">
                    <button type="button" class="glean-btn glean-action-btn" onclick={exportPortableSettings}>
                        {t(i18n, "settings.exportConfig")}
                    </button>
                    <label class="glean-btn glean-btn--ghost glean-action-btn" style="cursor: pointer; margin: 0; display: inline-flex; align-items: center;">
                        {t(i18n, "settings.importConfig")}
                        <input type="file" accept=".json,application/json" style="display: none;" onchange={importPortableSettings} />
                    </label>
                </div>
            </div>
        </div>
    </div>

    {/if}
    {#if maintenanceVisited}
    <div class="glean-settings__section glean-settings__section--maintenance" style:display={activeSection === "maintenance" ? "" : "none"}>
        <div class="glean-set-group glean-settings__extension-card">
            <SnapshotGovernance {facade} />
        </div>
        <div class="glean-set-group glean-settings__extension-card">
            <AiTagMergePanel {facade} />
        </div>
    </div>

    {/if}
    {#if activeSection === "integration"}
    <div class="glean-settings__section glean-settings__section--integration" aria-labelledby={`${idPrefix}-checkin-title`}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.checkinEnable")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.checkinEnableDesc")}</div>
                </div>
                <button class="glean-sw" class:glean-sw--on={checkinEnabled} aria-label={t(i18n, "settings.checkinEnable")} aria-pressed={checkinEnabled} aria-busy={checkinLoading} disabled={checkinLoading} onclick={() => void toggleCheckin()}></button>
            </div>
            {#if checkinLoadError}
                <div class="glean-set-row" role="alert">
                    <span class="glean-settings__error">{t(i18n, "settings.checkinLoadFailed")}</span>
                    <button class="glean-btn glean-btn--ghost" type="button" disabled={checkinLoading} onclick={() => void loadCheckinItems()}>{t(i18n, "action.retry")}</button>
                </div>
            {/if}
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.bridgeWriteEnable")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.bridgeWriteEnableDesc")}</div>
                </div>
                <button class="glean-sw" class:glean-sw--on={bridgeWriteEnabled} aria-label={t(i18n, "settings.bridgeWriteEnable")} aria-pressed={bridgeWriteEnabled} onclick={() => { bridgeWriteEnabled = !bridgeWriteEnabled; }}></button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.dailyNoteEnable")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.dailyNoteEnableDesc")}</div>
                </div>
                <button class="glean-sw" class:glean-sw--on={dailyNoteEnabled} aria-label={t(i18n, "settings.dailyNoteEnable")} aria-pressed={dailyNoteEnabled} onclick={() => { dailyNoteEnabled = !dailyNoteEnabled; }}></button>
            </div>
            {#if checkinEnabled}
                <div class="glean-set-row">
                    <div class="glean-set-row__lb">
                        {t(i18n, "settings.checkinItem")}
                        <div class="glean-set-row__desc">
                            {#if checkinLoading}{t(i18n, "settings.checkinLoading")}{:else if checkinLoadError}{t(i18n, "settings.checkinLoadFailed")}{:else if checkinItems.length === 0}{t(i18n, "settings.checkinNoItems")}{:else}{checkinItems.length} {t(i18n, "settings.checkinItemsFound")}{/if}
                        </div>
                    </div>
                    <select class="b3-select" aria-label={t(i18n, "settings.checkinItem")} disabled={checkinLoading || checkinLoadError || checkinItems.length === 0} bind:value={checkinItemId}>
                        <option value="">—</option>
                        {#each checkinItems as item (item.id)}
                            <option value={item.id}>{item.name}</option>
                        {/each}
                    </select>
                </div>
            {/if}
        </div>
    </div>

    {/if}
    {#if activeSection === "reading"}
    <div class="glean-settings__section glean-settings__section--experimental" aria-labelledby={`${idPrefix}-reader-title`}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.readerOpenInTab")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.readerOpenInTabHint")}</div>
                </div>
                <button
                    class="glean-sw"
                    class:glean-sw--on={readerOpenInTab}
                    title={t(i18n, "settings.readerOpenInTab")}
                    aria-label={t(i18n, "settings.readerOpenInTab")}
                    aria-pressed={readerOpenInTab}
                    onclick={() => { readerOpenInTab = !readerOpenInTab; }}
                ></button>
            </div>
            <div class="glean-set-row glean-seg-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.readerMode")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.readerModeHint")}</div>
                </div>
                <div class="glean-seg" role="group" aria-label={t(i18n, "settings.readerMode")}>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={readerMode === "read"}
                        aria-pressed={readerMode === "read"}
                        onclick={() => { readerMode = "read"; }}
                    >{t(i18n, "reader.modeRead")}</button>
                    <button
                        class="glean-seg__btn"
                        class:glean-seg__btn--on={readerMode === "edit"}
                        aria-pressed={readerMode === "edit"}
                        onclick={() => { readerMode = "edit"; }}
                    >{t(i18n, "reader.modeEdit")}</button>
                </div>
            </div>
        </div>
    </div>

    {/if}
    {#if maintenanceVisited}
    <div class="glean-settings__section glean-settings__section--maintenance glean-settings__section--danger" style:display={activeSection === "maintenance" ? "" : "none"}>
        <div class="glean-set-group">
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.rebuildIndex")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.rebuildIndexDesc")}</div>
                </div>
                <button class="glean-btn glean-action-btn" aria-busy={rebuildBusy} disabled={rebuildBusy} onclick={() => void doRebuildIndex()}>
                    {rebuildBusy ? t(i18n, "panel.loading") : t(i18n, "settings.rebuildIndex")}
                </button>
            </div>
            <div class="glean-set-row">
                <div class="glean-set-row__lb">
                    {t(i18n, "settings.aiLog")}
                    <div class="glean-set-row__desc">{t(i18n, "settings.aiLogDesc")}</div>
                </div>
                <button class="glean-btn glean-action-btn" disabled={aiLogLoading} aria-busy={aiLogLoading} onclick={() => void toggleAiLog()}>
                    {aiLogLoading ? t(i18n, "panel.loading") : aiLog === null || aiLogError ? t(i18n, "settings.aiLogView") : t(i18n, "action.close")}
                </button>
            </div>
            {#if aiLogError}
                <div class="glean-set-row" role="alert">
                    <span class="glean-settings__error">{t(i18n, "settings.aiLogLoadFailed")}</span>
                    <button class="glean-btn glean-btn--ghost" type="button" disabled={aiLogLoading} onclick={() => void toggleAiLog()}>{t(i18n, "action.retry")}</button>
                </div>
            {/if}
            {#if aiLog !== null && !aiLogError && aiLog.length > 0}
                <div class="glean-set-row glean-settings__log-list">
                    {#each aiLog as entry (entry.at + entry.docId)}
                        <div class="glean-logrow">
                            <span class="glean-logrow__time">{entry.at.slice(5, 16).replace("T", " ")}</span>
                            <span class="glean-logrow__stage">{entry.stage}</span>
                            <span class="glean-logrow__msg">{entry.message}</span>
                        </div>
                    {/each}
                </div>
            {:else if aiLog !== null && !aiLogError}
                <div class="glean-set-row glean-settings__log-empty">
                    {t(i18n, "settings.aiLogEmpty")}
                </div>
            {/if}
        </div>
    </div>
    {/if}
        </div>
    </div>

    <div class="glean-settings__footer">
        {#if confirmDiscardOpen}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div class="glean-settings__close-confirm" role="group" aria-live="assertive" aria-labelledby={`${idPrefix}-discard-title`} aria-describedby={`${idPrefix}-discard-description`} onkeydown={handleConfirmKeydown}>
                <strong id={`${idPrefix}-discard-title`}>{t(i18n, "settings.discardConfirmTitle")}</strong>
                <span id={`${idPrefix}-discard-description`}>{t(i18n, "settings.discardConfirmDescription")}</span>
                <div class="glean-settings__close-confirm-actions">
                    <button class="glean-btn glean-btn--ghost" bind:this={keepEditingButton} onclick={keepEditing}>{t(i18n, "settings.keepEditing")}</button>
                    <button class="glean-btn glean-btn--danger" bind:this={discardButton} onclick={discardAndClose}>{t(i18n, "settings.discardAndClose")}</button>
                </div>
            </div>
        {:else if confirmResetOpen}
            <div class="glean-settings__close-confirm" role="group" aria-live="assertive" aria-labelledby={`${idPrefix}-reset-title`} aria-describedby={`${idPrefix}-reset-description`}>
                <strong id={`${idPrefix}-reset-title`}>{t(i18n, "settings.resetConfirmTitle")}</strong>
                <span id={`${idPrefix}-reset-description`}>{t(i18n, "settings.resetConfirmDescription")}</span>
                <div class="glean-settings__close-confirm-actions">
                    <button class="glean-btn glean-btn--ghost" bind:this={cancelResetButton} onclick={() => { confirmResetOpen = false; }}>{t(i18n, "action.cancel")}</button>
                    <button class="glean-btn glean-btn--danger" onclick={resetDefaults}>{t(i18n, "settings.resetDefaults")}</button>
                </div>
            </div>
        {:else}
            <div class="glean-settings__status" class:glean-settings__status--dirty={draftDirty} aria-live="polite">
                {#if draftDirty}
                    <span class="glean-settings__dirty-tag">{t(i18n, "settings.unsavedChanges")}</span>
                {/if}
                <span class="glean-settings__ecosystem-badge" title={ecosystemBadgeText}>
                    {ecosystemBadgeText}
                </span>
            </div>
            <button class="glean-btn" disabled={saveBusy} onclick={() => { confirmResetOpen = true; void tick().then(() => cancelResetButton?.focus()); }}>
                {t(i18n, "settings.resetDefaults")}
            </button>
            <button class="glean-btn" disabled={saveBusy} onclick={cancel}>
                {t(i18n, "action.cancel")}
            </button>
            <button class="glean-btn glean-btn--pri" bind:this={saveButton} aria-busy={saveBusy} disabled={saveBusy || !draftDirty} onclick={() => void save()}>
                {saveBusy ? t(i18n, "panel.loading") : t(i18n, "action.save")}
            </button>
        {/if}
    </div>
</section>

<style>
    /* R54：平静表面、连续留白。设置仍是独立尺寸容器，窄 Dock 使用顶部分类导航。 */
    .glean-settings__layout {
        display: flex;
        align-items: stretch;
        gap: var(--glean-space-6);
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
    }

    .glean-settings__nav {
        flex: 0 0 220px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-4);
        padding: 0 var(--glean-space-3) 0 0;
        border-right: 1px solid var(--glean-border-soft);
    }

    .glean-settings__brand {
        display: flex;
        align-items: center;
        gap: var(--glean-space-3);
        padding: var(--glean-space-1) var(--glean-space-2) var(--glean-space-2);
    }

    .glean-settings__brand-mark {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        border-radius: var(--glean-radius-md);
        background: var(--glean-primary-soft);
        color: var(--glean-accent-b);
        box-shadow: none;
    }

    .glean-settings__brand-mark svg {
        width: 20px;
        height: 20px;
    }

    .glean-settings__brand-copy {
        min-width: 0;
    }

    .glean-settings__brand-title {
        margin: 0;
        font-size: 18px;
        font-weight: 650;
        line-height: 1.3;
        color: var(--b3-theme-on-background);
    }

    .glean-settings__brand-sub {
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.65;
        color: var(--b3-theme-on-surface);
    }

    .glean-settings__nav-list {
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-1);
        overflow-y: auto;
        min-height: 0;
        padding: var(--glean-space-1) 0;
    }

    .glean-settings__tab {
        display: flex;
        align-items: center;
        gap: var(--glean-space-2-5);
        width: 100%;
        min-height: 42px;
        padding: 8px 14px;
        border: none;
        border-radius: var(--glean-radius-pill, 999px);
        background: none;
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 13.5px;
        line-height: 1.5;
        text-align: left;
        cursor: pointer;
        position: relative;
        transition: background-color 160ms var(--glean-ease-out), color 160ms var(--glean-ease-out);
    }

    .glean-settings__tab-icon {
        flex: 0 0 auto;
        opacity: 0.72;
        color: inherit;
        transition: opacity 160ms var(--glean-ease-out), color 160ms var(--glean-ease-out);
    }

    .glean-settings__tab:hover {
        background: var(--glean-inset-surface);
    }

    .glean-settings__tab:focus-visible {
        outline: 2px solid var(--glean-color-action);
        outline-offset: -2px;
    }

    .glean-settings__tab--on {
        background: color-mix(in srgb, var(--glean-color-action) 12%, var(--b3-theme-surface));
        color: var(--glean-color-action);
        font-weight: 650;
    }

    .glean-settings__tab--on .glean-settings__tab-icon {
        opacity: 1;
        color: var(--glean-color-action);
    }

    .glean-settings__tab-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .glean-settings__tab-badge {
        flex: 0 0 auto;
        padding: 0 8px;
        border-radius: var(--glean-radius-pill, 999px);
        background: var(--glean-inset-surface);
        color: var(--b3-theme-on-surface);
        font-size: 11px;
        line-height: 20px;
    }

    .glean-settings__tab--on .glean-settings__tab-badge {
        background: color-mix(in srgb, var(--glean-color-action) 18%, transparent);
        color: var(--glean-color-action);
    }

    .glean-settings__content {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-5);
        padding: 0 var(--glean-space-2) var(--glean-space-2) 0;
        scrollbar-gutter: stable;
    }

    .glean-settings__newbie-banner {
        flex-shrink: 0 !important;
        min-height: fit-content !important;
        box-sizing: border-box;
        display: flex;
        align-items: flex-start;
        gap: var(--glean-space-3);
        padding: var(--glean-space-3) var(--glean-space-4);
        border-radius: var(--glean-radius-lg);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, var(--glean-border-soft));
        box-shadow: var(--glean-shadow-card);
    }

    .glean-settings__newbie-banner-icon {
        flex: 0 0 32px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
        color: var(--b3-theme-primary);
        margin-top: 2px;
    }

    .glean-settings__newbie-banner-body {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-2);
    }

    .glean-settings__newbie-banner-text {
        font-size: 13px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface);
        overflow-wrap: anywhere;
    }

    .glean-settings__newbie-banner-actions {
        display: flex;
        align-items: center;
        gap: var(--glean-space-3);
        flex-wrap: wrap;
    }

    .glean-settings__pagehead {
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-2);
        padding: var(--glean-space-1) 0;
    }

    .glean-settings__page-title {
        font-size: 26px;
        font-weight: 650;
        line-height: 1.3;
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-background);
    }

    .glean-settings__page-desc {
        font-size: 14px;
        line-height: 1.65;
        color: var(--b3-theme-on-surface);
    }

    /* 锚点笔记本工具行：搜索 + 计数 + 清空 */
    .glean-nb-tools {
        display: flex;
        align-items: center;
        gap: var(--glean-space-3);
        flex-wrap: wrap;
        padding: 0 var(--glean-space-5);
    }

    .glean-nb-search {
        flex: 1 1 180px;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        min-height: 40px;
        box-sizing: border-box;
        padding: 6px 12px;
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-md);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
    }

    .glean-nb-search:focus-within {
        border-color: color-mix(in srgb, var(--glean-color-action) 45%, var(--glean-border-soft));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--glean-color-action) 18%, transparent);
    }

    .glean-nb-search__input {
        flex: 1 1 auto;
        min-width: 0;
        border: none;
        background: none;
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 13px;
        outline: none;
    }

    .glean-nb-search__clear {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        min-width: 32px;
        min-height: 32px;
        font-size: 18px;
        line-height: 1;
        padding: 2px 4px;
    }

    .glean-nb-count {
        flex: 0 0 auto;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
    }

    .glean-settings__section {
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-4);
        min-width: 0;
    }

    .glean-settings__section > .glean-set-group {
        min-width: 0;
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-lg);
        background: var(--glean-card-surface);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    .glean-settings__section .glean-set-row {
        min-width: 0;
        gap: var(--glean-space-4);
        padding: var(--glean-space-4) var(--glean-space-5);
        font-size: 14px;
        line-height: 1.65;
        border-color: color-mix(in srgb, var(--glean-border-soft) 85%, transparent);
        box-shadow: none;
    }

    .glean-settings__section .glean-set-row:focus-within {
        background: transparent;
        box-shadow: none;
    }

    .glean-settings__section .glean-set-row__lb {
        line-height: 1.65;
    }

    .glean-settings__section .glean-set-row__desc {
        max-width: 58ch;
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.65;
        color: var(--b3-theme-on-surface);
    }

    .glean-settings .glean-mini-input,
    .glean-settings .b3-select {
        min-height: 38px;
        border-radius: var(--glean-radius-pill);
        background: var(--b3-theme-background);
        border: 1px solid var(--glean-border-soft);
        padding-inline: var(--glean-space-3);
        font-size: 13px;
        transition: border-color var(--glean-duration-fast) var(--glean-ease-enter), box-shadow var(--glean-duration-fast) var(--glean-ease-enter);
    }

    .glean-settings .glean-mini-input:focus,
    .glean-settings .b3-select:focus {
        border-color: var(--glean-color-action);
        box-shadow: var(--glean-shadow-focus);
    }

    .glean-settings .glean-nb-wrap {
        gap: var(--glean-space-2);
        padding: var(--glean-space-4) var(--glean-space-5);
    }

    .glean-settings .glean-nb {
        display: inline-flex;
        align-items: center;
        gap: var(--glean-space-1);
        min-height: 36px;
        max-width: 100%;
        padding: 6px 14px;
        border-radius: var(--glean-radius-sm);
        font-size: 13px;
        line-height: 1.5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        mask-image: linear-gradient(to right, #000 88%, transparent 100%);
        -webkit-mask-image: linear-gradient(to right, #000 88%, transparent 100%);
        transition: transform var(--glean-duration-fast) var(--glean-ease-enter), background-color var(--glean-duration-fast) var(--glean-ease-enter), border-color var(--glean-duration-fast) var(--glean-ease-enter);

        .glean-icon {
            flex-shrink: 0;
        }

        &:hover {
            transform: translateY(-1px);
        }
    }

    .glean-settings__extension-card {
        background: transparent;
        box-shadow: none;
    }

    .glean-settings .glean-nb.glean-nb--on {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 52%, var(--glean-border-soft));
        background: var(--glean-primary-soft);
        color: var(--b3-theme-primary);
    }

    /* 本组件作为尺寸容器：窄容器（移动端 / 窄 Dock）时导航降级为顶部横向 tab */
    .glean-settings {
        container: glean-settings / inline-size;
        overflow: hidden;
        font-size: 14px;
        line-height: 1.65;
    }

    .glean-settings__close-confirm {
        display: grid;
        flex: 1 1 100%;
        gap: var(--glean-space-2);
        min-width: 0;
        padding: var(--glean-space-2) 0;
        color: var(--b3-theme-on-surface);
    }

    .glean-settings__close-confirm-actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: var(--glean-space-2);
    }

    .glean-settings__nav-ecosystem {
        margin-top: auto;
        padding: var(--glean-space-3) var(--glean-space-1) 0;
        border-top: 1px dashed var(--glean-border-soft);
        font-size: var(--glean-text-xs);
        line-height: var(--glean-leading-tight);
    }

    .glean-settings__ecosystem-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--glean-space-1);
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.85;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .glean-settings__dirty-tag {
        margin-right: var(--glean-space-2);
        color: var(--glean-st-inbox-text);
        font-weight: var(--glean-weight-semibold);
    }

    @container glean-settings (max-width: 600px) {
        .glean-settings__layout {
            flex-direction: column;
            gap: var(--glean-space-4);
        }

        .glean-settings__nav-ecosystem {
            display: none;
        }

        .glean-settings__nav {
            flex: 0 0 auto;
            border-right: none;
            border-bottom: 1px solid var(--glean-border-soft);
            gap: var(--glean-space-2);
            padding: 0 0 var(--glean-space-2);
        }

        .glean-settings__brand {
            padding: 0 var(--glean-space-1);
        }

        .glean-settings__brand-sub {
            display: none;
        }

        .glean-settings__nav-list {
            flex-direction: row;
            align-items: center;
            overflow-x: auto;
            overflow-y: hidden;
            gap: var(--glean-space-1);
            padding: 0;
        }

        .glean-settings__tab {
            width: auto;
            flex: 0 0 auto;
            min-height: 44px;
            padding: 6px 12px;
            border-radius: var(--glean-radius-md);
        }

        .glean-settings__tab-badge {
            display: none;
        }

        /* 触控命中区随容器断点走：宽视口下的窄 Dock 同样生效（T-3315） */
        .glean-nb-search {
            min-height: 44px;
        }

        .glean-settings__page-title {
            font-size: 24px;
        }

        .glean-settings__content {
            gap: var(--glean-space-4);
        }

        .glean-settings__section .glean-set-row {
            align-items: flex-start;
            flex-wrap: wrap;
            gap: var(--glean-space-3);
            padding: var(--glean-space-4);
        }

        .glean-settings__section .glean-set-row > :last-child:not(.glean-set-row__lb) {
            margin-left: auto;
        }

        .glean-nb-tools,
        .glean-settings .glean-nb-wrap {
            padding-inline: var(--glean-space-4);
        }

        .glean-settings .glean-mini-input,
        .glean-settings .b3-select,
        .glean-settings .glean-nb,
        .glean-nb-search__clear {
            min-height: 44px;
        }

        .glean-nb-search__clear {
            min-width: 44px;
        }
    }

    @media (max-width: 640px) {
        .glean-settings__layout {
            flex-direction: column;
            gap: var(--glean-space-3);
        }

        .glean-settings__nav-ecosystem {
            display: none;
        }

        .glean-settings__nav {
            flex: 0 0 auto;
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--glean-border-soft);
            gap: var(--glean-space-2);
            padding: 0 0 var(--glean-space-2);
        }

        .glean-settings__brand {
            padding: 0 var(--glean-space-1);
        }

        .glean-settings__brand-sub {
            display: none;
        }

        .glean-settings__nav-list {
            flex-direction: row;
            align-items: center;
            overflow-x: auto;
            overflow-y: hidden;
            gap: var(--glean-space-1);
            padding: 0;
            scrollbar-width: none;
        }

        .glean-settings__nav-list::-webkit-scrollbar {
            display: none;
        }

        .glean-settings__tab {
            width: auto;
            flex: 0 0 auto;
            min-height: 40px;
            padding: 6px 12px;
            border-radius: var(--glean-radius-md);
        }

        .glean-settings__tab-badge {
            display: none;
        }

        .glean-settings__page-title {
            font-size: 20px;
        }

        .glean-settings__content {
            gap: var(--glean-space-3);
            padding-right: 0;
        }

        .glean-settings__section .glean-set-row {
            align-items: flex-start;
            flex-wrap: wrap;
            gap: var(--glean-space-2-5);
            padding: var(--glean-space-3);
        }
    }

    @media (forced-colors: active) {
        .glean-settings__tab[aria-selected="true"],
        .glean-nb--on {
            border: 2px solid Highlight;
            color: Highlight;
        }

        .glean-settings__newbie-banner,
        .glean-nb-search,
        .glean-settings__section > .glean-set-group {
            border: 1px solid CanvasText;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .glean-settings__tab,
        .glean-palette-card,
        .glean-settings .glean-nb {
            transition: none !important;
            transform: none !important;
        }
    }
</style>
