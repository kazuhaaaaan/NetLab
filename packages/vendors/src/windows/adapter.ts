// Vendor Windows — adapter CLI (GUI desktop menangani hal yang lebih dalam).
import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { CommandResult, VendorAdapter as _IV } from '../common/types';

export class WindowsVendorAdapter implements _IV {
  vendorId = 'windows';
  vendorName = 'Microsoft Windows';
  promptTemplate = 'C:\\Users\\admin>';
  private parser = new CLIParser();

  parseSyntax(rawInput: string): NormalizedCommand {
    const ast = this.parser.parse(rawInput);
    const action = String(ast.command).toLowerCase();
    const subs = ast.subCommands.map((s) => String(s).toLowerCase());

    if (isPrefix(action, 'ipconfig')) return { action: 'ipconfig', target: 'windows', payload: { raw: rawInput, ast, all: subs.includes('/all') } };
    if (isPrefix(action, 'ping')) return { action: 'ping', target: 'windows', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'nslookup')) return { action: 'nslookup', target: 'windows', payload: { raw: rawInput, ast, host: subs[0] } };
    if (isPrefix(action, 'curl')) return { action: 'http_get', target: 'windows', payload: { raw: rawInput, ast, url: subs[0] } };
    if (isPrefix(action, 'hostname')) return { action: 'hostname', target: 'windows', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'ver')) return { action: 'ver', target: 'windows', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'systeminfo')) return { action: 'systeminfo', target: 'windows', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'dir') || isPrefix(action, 'ls')) return { action: 'dir', target: 'windows', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'type') || isPrefix(action, 'cat')) return { action: 'type', target: 'windows', payload: { raw: rawInput, ast, path: subs.join(' ') } };
    if (isPrefix(action, 'cls') || isPrefix(action, 'clear')) return { action: 'cls', target: 'windows', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'echo')) return { action: 'echo', target: 'windows', payload: { raw: rawInput, ast } };
    if (isPrefix(action, 'help') || action === '?') return { action: 'help', target: 'windows', payload: { raw: rawInput, ast } };
    return { action: action || 'EXEC_COMMAND', target: 'windows', payload: { raw: rawInput, ast } };
  }

  formatResponse(cmdResult: CommandResult | undefined): string {
    if (!cmdResult) return '';
    return cmdResult.raw ?? '';
  }
}

function isPrefix(input: string, prefix: string): boolean {
  return input.startsWith(prefix);
}