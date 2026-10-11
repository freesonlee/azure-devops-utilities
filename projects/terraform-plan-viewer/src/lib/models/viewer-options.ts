export type TerraformResourceFilter = 'auto' | 'total' | 'changes' | 'create' | 'update' | 'delete' | 'replace' | 'no-op';
export type TerraformViewerView = 'resources' | 'outputs' | 'variables' | 'terraform' | 'construct';

export interface TerraformViewerOptions {
  /** Embedded viewers stay inside their host container. Page mode enables viewport floating. */
  layout?: 'embedded' | 'page';
  /** Height of the host's sticky toolbar, in pixels. Used only in page mode. */
  viewportTopOffset?: number;
  /** Show target/import/remove controls. The host implements actions through outputs. */
  enableActions?: boolean;
  /** Whether the user may explicitly reveal values marked sensitive. Defaults to true. */
  allowSensitiveReveal?: boolean;
}

export interface CdktfResourceMetadata {
  '//'?: { metadata?: { path?: string; [key: string]: unknown } };
  [key: string]: unknown;
}

export interface CdktfMetadata {
  resource?: Record<string, Record<string, CdktfResourceMetadata>>;
  [key: string]: unknown;
}

export interface TerraformViewerError {
  code: 'invalid-plan';
  message: string;
}
