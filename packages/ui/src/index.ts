export interface UITheme {
  mode: 'dark' | 'light';
  primaryColor: string;
  surfaceBg: string;
  panelBorder: string;
}

export interface PanelState {
  isSidebarOpen: boolean;
  isTerminalOpen: boolean;
  isInspectorOpen: boolean;
}

export const defaultDarkTheme: UITheme = {
  mode: 'dark',
  primaryColor: '#3b82f6',
  surfaceBg: '#0f172a',
  panelBorder: '#1e293b'
};
