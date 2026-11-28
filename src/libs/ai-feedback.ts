/** Map stable AI transport failures to safe, localized user feedback. */
export function aiFailureKey(reason?: string): string | null {
    if (reason === "permission" || reason === "network" || reason === "timeout") return `ai.failure.${reason}`;
    return null;
}

/** 统一生成隐私闸门拦截的人话说明（兼容 lv-ai-gate 与 lv-notice-kit 两套错误文本）。 */
export function formatLvAiPolicyBlockMessage(error: unknown, destinationLabel: string): string {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    const rawMsg = error instanceof Error ? error.message : String(error ?? "");
    if (code === "ai_shared_key_denied" || /共享 AI Key/i.test(rawMsg)) {
        return `「小驴拾遗」未在生态 AI 授权中勾选共享密钥权限，已拦截外发（目标：${destinationLabel}）。请在小驴罗盘共享 AI 设置中勾选授权，或改用「思源内置 AI」。`;
    }
    if (code === "ai_siyuan_only" || /思源本体 AI|ai_siyuan_only/i.test(rawMsg)) {
        return `已开启「仅允许思源本体 AI」隐私保护，已拦截外部 AI 外发请求（目标：${destinationLabel}）。请在小驴罗盘关闭该限制，或切换为「思源内置」通道。`;
    }
    if (code === "ai_origin_mismatch" || /目标域名已偏离|ai_origin_mismatch/i.test(rawMsg)) {
        return `外部 AI 目标域名与预检确认不一致，已拦截潜在漂移外发（目标：${destinationLabel}）。`;
    }
    return rawMsg ? `${rawMsg}（目标：${destinationLabel}）` : `AI 请求已被隐私策略拦截（目标：${destinationLabel}）`;
}
