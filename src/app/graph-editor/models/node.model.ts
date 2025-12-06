export interface NodeModel {
  id: string;
  label: string;
  type?: string;
  expr?: string;
  position?: { x: number; y: number } | undefined;
}
