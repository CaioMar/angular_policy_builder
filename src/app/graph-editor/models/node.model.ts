export interface NodeModel {
  id: string;
  label: string;
  variable?: string;
  type?: string;
  expr?: string;
  position?: { x: number; y: number } | undefined;
}
