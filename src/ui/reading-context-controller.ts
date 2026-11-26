/**
 * 把阅读上下文挂到思源原生编辑器容器，跟随根块切换和编辑器销毁卸载。
 * 仅使用 SDK 公开的事件与 IProtyle.element/rootID；不进入正文 DOM。
 */
import type { GleanFacade } from "../types.ts";
import { ReadingContextCoordinator } from "../coordinators/reading-context.ts";

export { ReadingContextCoordinator, type MountedContext } from "../coordinators/reading-context.ts";

export function installReadingContext(facade: GleanFacade): () => void {
    const coordinator = new ReadingContextCoordinator({ facade });
    return () => coordinator.dispose();
}
