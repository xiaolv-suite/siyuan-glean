export interface LibraryFieldDef {
    key: string;
    name: string;
    type: "select" | "number" | "url" | "text";
}

export const LIBRARY_FIELDS: LibraryFieldDef[] = [
    { key: "status", name: "状态", type: "select" },
    { key: "words", name: "字数", type: "number" },
    { key: "minutes", name: "时长", type: "number" },
    { key: "url", name: "来源", type: "url" },
];

export const EXTENDED_LIBRARY_FIELDS: LibraryFieldDef[] = [
    ...LIBRARY_FIELDS,
    { key: "author", name: "作者", type: "text" },
    { key: "priority", name: "优先级", type: "number" },
    { key: "rating", name: "评分", type: "number" },
    { key: "readMinutes", name: "实读时长", type: "number" },
    { key: "summary", name: "AI摘要", type: "text" },
];
