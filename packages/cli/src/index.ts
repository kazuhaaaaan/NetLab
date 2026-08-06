export interface Token {
  type: 'KEYWORD' | 'ARGUMENT' | 'FLAG' | 'STRING' | 'NUMBER' | 'PIPE';
  value: string;
  position: number;
}

export interface ASTNode {
  command: string;
  subCommands: string[];
  parameters: Record<string, string>;
  kwargs: Record<string, string>;
  flags: string[];
}

export interface NormalizedCommand {
  action: string;
  target: string;
  payload: Record<string, unknown>;
}

export class CLIParser {
  tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    const parts = input.trim().split(/\s+/);
    
    parts.forEach((part, index) => {
      if (!part) return;
      if (part.startsWith('--') || part.startsWith('-')) {
        tokens.push({ type: 'FLAG', value: part, position: index });
      } else if (part.includes('=')) {
        tokens.push({ type: 'ARGUMENT', value: part, position: index });
      } else if (part === '|') {
        tokens.push({ type: 'PIPE', value: part, position: index });
      } else {
        tokens.push({ type: 'KEYWORD', value: part, position: index });
      }
    });

    return tokens;
  }

  parse(input: string): ASTNode {
    const tokens = this.tokenize(input);
    const parameters: Record<string, string> = {};
    const node: ASTNode = {
      command: '',
      subCommands: [],
      parameters,
      kwargs: parameters, // alias — same reference
      flags: []
    };

    if (tokens.length > 0 && tokens[0].type === 'KEYWORD') {
      node.command = tokens[0].value;
    }

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'KEYWORD') {
        node.subCommands.push(token.value);
      } else if (token.type === 'FLAG') {
        node.flags.push(token.value);
      } else if (token.type === 'ARGUMENT') {
        const [key, val] = token.value.split('=');
        parameters[key] = val || '';
      }
    }

    return node;
  }
}
