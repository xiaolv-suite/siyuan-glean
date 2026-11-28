<script lang="ts">
    import { untrack } from "svelte";
    import {
        mountLvAiThinkingCard,
        type LvAiPresetScenario,
        type LvAiStageDefinition,
        type LvAiThinkingCardHandle,
    } from "../libs/notice";

    interface Props {
        scenario?: LvAiPresetScenario;
        stages?: LvAiStageDefinition[];
        defaultIcon?: string;
        title?: string;
        subtitle?: string;
        cancelLabel?: string | false;
        compact?: boolean;
        extraClass?: string;
        stageText?: string;
        stageIcon?: string;
        signal?: AbortSignal;
        onCancel?: () => void;
    }

    let {
        scenario = "general",
        stages,
        defaultIcon,
        title,
        subtitle,
        cancelLabel,
        compact = false,
        extraClass,
        stageText,
        stageIcon,
        signal,
        onCancel,
    }: Props = $props();

    let hostEl = $state<HTMLElement | null>(null);
    let handle = $state.raw<LvAiThinkingCardHandle | null>(null);

    $effect(() => {
        const target = hostEl;
        const currentScenario = scenario;
        const isCompact = compact;
        const currentSignal = signal;
        if (!target) return;

        const mounted = untrack(() =>
            mountLvAiThinkingCard(target, {
                scenario: currentScenario,
                stages,
                defaultIcon,
                title,
                subtitle,
                cancelLabel,
                compact: isCompact,
                extraClass,
                signal: currentSignal,
                onCancel: () => onCancel?.(),
            })
        );
        if (untrack(() => stageText !== undefined || stageIcon !== undefined)) {
            mounted.update({
                ...(stageText !== undefined ? { stageText } : {}),
                ...(stageIcon !== undefined ? { stageIcon } : {}),
            });
        }
        handle = mounted;
        return () => {
            handle = null;
            mounted.destroy();
        };
    });

    $effect(() => {
        const current = handle;
        if (!current) return;
        current.update({
            title,
            subtitle,
            stageText,
            stageIcon,
            ...(typeof cancelLabel === "string" ? { cancelLabel } : {}),
        });
    });
</script>

<div class="glean-ai-thinking-host" bind:this={hostEl}></div>

<style>
    .glean-ai-thinking-host {
        display: block;
        width: 100%;
        min-width: 0;
    }
</style>
