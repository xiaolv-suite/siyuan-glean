/**
 * 轻量容灾节流调度钩子（零外部依赖，防止测试与纯模块循环引入 lv-notice-kit）。
 */
let autoBackupHook: (() => void) | null = null;
let suspendDepth = 0;

export function registerVaultAutoBackupHook(hook: (() => void) | null): void {
    autoBackupHook = hook;
}

export function scheduleVaultAutoBackup(): void {
    if (suspendDepth > 0) return;
    try {
        autoBackupHook?.();
    } catch {
        // 容灾调度异常不得阻断主存储流程
    }
}

export async function withoutVaultAutoBackup<T>(task: () => Promise<T>): Promise<T> {
    suspendDepth += 1;
    try {
        return await task();
    } finally {
        suspendDepth = Math.max(0, suspendDepth - 1);
    }
}
