/**
 * DisposerRegistry 资源释放注册表：
 * 统一纳管定时器、事件监听器、外部 Cleaner、Protyle 实例与 DOM 清理。
 * 契约：
 * 1. 100% 幂等：多次调用 dispose() 绝不报错，二次调用直接返回。
 * 2. 异常隔离：单个清理函数抛出异常时捕获并隔离，不阻断注册表内其他清理函数的执行。
 * 3. 树状级联：支持 createChild() 创建子注册表，父级销毁时自动级联销毁所有子级。
 */

export type DisposerFunction = () => void;

export type DisposerLike =
    | DisposerFunction
    | { dispose: () => void }
    | { destroy: () => void }
    | null
    | undefined;

export interface IDisposerRegistry {
    readonly isDisposed: boolean;
    add(disposer: DisposerLike): DisposerFunction;
    addTimeout(timerId: number | null | undefined): void;
    addInterval(intervalId: number | null | undefined): void;
    addEventListener(
        target: EventTarget | null | undefined,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    createChild(): IDisposerRegistry;
    dispose(): void;
}

export class DisposerRegistry implements IDisposerRegistry {
    private _isDisposed = false;
    private readonly disposers: Set<DisposerFunction> = new Set();
    private readonly children: Set<IDisposerRegistry> = new Set();

    get isDisposed(): boolean {
        return this._isDisposed;
    }

    /** 注册清理函数或带 dispose/destroy 方法的对象，返回注销函数 */
    add(disposer: DisposerLike): DisposerFunction {
        if (!disposer) return () => {};
        if (this._isDisposed) {
            this.safeExecute(disposer);
            return () => {};
        }

        const fn: DisposerFunction = () => {
            this.safeExecute(disposer);
        };

        this.disposers.add(fn);
        return () => {
            this.disposers.delete(fn);
        };
    }

    /** 注册 setTimeout 句柄 */
    addTimeout(timerId: number | null | undefined): void {
        if (timerId == null) return;
        if (this._isDisposed) {
            clearTimeout(timerId);
            return;
        }
        this.add(() => clearTimeout(timerId));
    }

    /** 注册 setInterval 句柄 */
    addInterval(intervalId: number | null | undefined): void {
        if (intervalId == null) return;
        if (this._isDisposed) {
            clearInterval(intervalId);
            return;
        }
        this.add(() => clearInterval(intervalId));
    }

    /** 注册 DOM / Window / EventTarget 事件监听 */
    addEventListener(
        target: EventTarget | null | undefined,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        if (!target) return;
        if (this._isDisposed) return;
        target.addEventListener(type, listener, options);
        this.add(() => {
            try {
                target.removeEventListener(type, listener, options);
            } catch {
                // ignore
            }
        });
    }

    /** 创建树状级联的子注册表 */
    createChild(): IDisposerRegistry {
        if (this._isDisposed) {
            const child = new DisposerRegistry();
            child.dispose();
            return child;
        }
        const child = new DisposerRegistry();
        this.children.add(child);
        child.add(() => {
            this.children.delete(child);
        });
        return child;
    }

    /** 幂等执行全量清理 */
    dispose(): void {
        if (this._isDisposed) return;
        this._isDisposed = true;

        // 级联释放所有子注册表
        for (const child of this.children) {
            try {
                child.dispose();
            } catch (err) {
                console.warn("[glean] child disposer failed:", err);
            }
        }
        this.children.clear();

        // 逆序执行自身注册的清理函数
        const queue = Array.from(this.disposers).reverse();
        this.disposers.clear();

        for (const fn of queue) {
            try {
                fn();
            } catch (err) {
                console.warn("[glean] disposer function threw error:", err);
            }
        }
    }

    private safeExecute(item: DisposerLike): void {
        try {
            if (typeof item === "function") {
                item();
            } else if (item && typeof (item as { dispose?: unknown }).dispose === "function") {
                (item as { dispose: () => void }).dispose();
            } else if (item && typeof (item as { destroy?: unknown }).destroy === "function") {
                (item as { destroy: () => void }).destroy();
            }
        } catch (err) {
            console.warn("[glean] safeExecute disposer failed:", err);
        }
    }
}

export function createDisposer(): DisposerRegistry {
    try {
        if (typeof DisposerRegistry === "function") return new DisposerRegistry();
    } catch { /* mock */ }
    return {
        isDisposed: false,
        add: () => () => {},
        addTimeout: () => {},
        addInterval: () => {},
        addEventListener: () => {},
        createChild: () => createDisposer(),
        dispose: () => {},
    } as unknown as DisposerRegistry;
}

