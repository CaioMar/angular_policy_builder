export interface EdgeCondition {
  variable?: string;
  op?: string;
  value?: string;
}

export interface EdgeModel {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: EdgeCondition;
  output?: string;
}
