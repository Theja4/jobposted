import type {
  CanonicalFieldKey,
  ExtensionFieldControl,
  ExtensionFieldFillRecord,
  ExtensionFieldMapping,
  ExtensionPlatform,
  MasterProfile,
} from "@jobposted/shared";

export interface FieldDescriptor {
  id: string;
  element: HTMLElement;
  label: string;
  context: string;
  type: ExtensionFieldControl;
  required: boolean;
  options: string[];
  signature: string;
  adapterKey?: CanonicalFieldKey;
  adapterConfidence?: number;
}

export interface AdapterHint {
  selector: string;
  key: CanonicalFieldKey;
  confidence?: number;
}

export interface FillContext {
  profile: MasterProfile;
  platform: ExtensionPlatform;
  url: string;
  overwrite: boolean;
  demographicsEnabled: boolean;
  getResume: (jobId?: string | null) => Promise<{ resumeUrl: string | null; coverLetterUrl?: string | null }>;
  onField: (record: ExtensionFieldFillRecord) => void;
  llmMap: (field: FieldDescriptor) => Promise<ExtensionFieldMapping | null>;
}

export interface PlatformAdapter {
  id: ExtensionPlatform;
  label: string;
  match(url: URL, dom: Document): boolean;
  detectStep(dom: Document): { name: string; index?: number; total?: number };
  mapFields(dom: Document): AdapterHint[];
  fillExtras?(context: FillContext): Promise<void>;
  findAdvance(dom: Document): HTMLElement | null;
  findSubmit(dom: Document): HTMLElement | null;
  notes: string;
}

export interface AutofillResult {
  platform: ExtensionPlatform;
  stepName: string;
  fields: ExtensionFieldFillRecord[];
  filled: number;
  total: number;
}
