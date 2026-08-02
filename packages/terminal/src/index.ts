export interface TerminalTab {
  id: string;
  deviceId: string;
  deviceName: string;
  vendor: string;
  history: string[];
  currentPrompt: string;
}

export interface TerminalOutputLine {
  id: string;
  text: string;
  type: 'input' | 'output' | 'error' | 'system';
  timestamp: number;
}
