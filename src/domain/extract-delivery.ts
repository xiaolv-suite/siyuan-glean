/** A stable identity for the full selection; different selections in one block stay distinct. */
export function extractDeliveryKey(docId: string, blockId: string, text: string): string {
    const value = JSON.stringify([docId, blockId, text.trim()]);
    let a = 2166136261, b = 3335557771;
    for (const char of value) { const n = char.codePointAt(0)!; a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822519); }
    return `glean:extract:${value.length.toString(36)}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}
