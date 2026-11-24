/**
 * The machine template an assembly instruction is written under: its model's final inspection
 * template (by its id), whose model is the instruction's.
 */
export type AssemblyMachine = { templateId: string; modelCode: string; modelName: string };
