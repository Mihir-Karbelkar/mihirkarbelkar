export type ChatRole = 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface InferenceEvent {
  type: 'token' | 'done' | 'error';
  text?: string;
}
export interface Observation {
  label: string;
  similarity: number;
  embedding?: number[];
  timestamp: number;
}
export type Action =
  'move-right' | 'move-left' | 'move-up' | 'move-down' | 'wait';
export interface Point {
  x: number;
  y: number;
}
export interface TraceEntry {
  time: number;
  kind: 'observe' | 'act' | 'dream' | 'system';
  text: string;
}
export interface PerceptionResult {
  model: string;
  revision: string;
  mode: 'live' | 'recorded';
  elapsedMs: number;
  observations: Observation[];
  preprocessing: string;
  embedding: number[];
}
export interface Recording {
  schemaVersion: 1;
  clip: string;
  generatedAt: string;
  provenance: {
    model: string;
    revision: string;
    preprocessing: string;
    source: string;
  };
  result: PerceptionResult;
}
