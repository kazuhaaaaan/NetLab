import { PingSimResult } from './simulation';

const REASON_TEXT: Record<string, string> = {
  'no-ip': 'no usable source IP configured on this device (set one first, e.g. /ip address add)',
  invalid: 'invalid destination address',
  'not-found': 'device not found in simulation',
  unreachable: 'destination host unreachable (no route to network)',
  ttl: 'time to live exceeded in transit (routing loop or too many hops)',
  self: 'pinging this device itself',
};

function errorLines(vendorId: string, host: string, r: PingSimResult): string[] {
  const why = REASON_TEXT[r.reason || 'unreachable'];
  const rtt = (ms: number) =>
    ms === 0
      ? '<1ms'
      : `${Math.max(1, Math.round(ms))}.${Math.floor(Math.random() * 900 + 100)}ms`;

  if (vendorId === 'mikrotik') {
    return [
      `  SEQ HOST                                     SIZE TTL TIME  STATUS`,
      `    0 ${host.padEnd(40)} 56   --  --   timeout`,
      `    sent=1 received=0 packet-loss=100% min-rtt=n/a avg-rtt=n/a max-rtt=n/a`,
      `  -- ${why}`,
    ];
  }
  if (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba') {
    return [
      `Type escape sequence to abort.`,
      `Sending 5, 100-byte ICMP Echos to ${host}, timeout is 2 seconds:`,
      `.....`,
      `Success rate is 0 percent (0/5)`,
      `  -- ${why}`,
    ];
  }
  if (vendorId === 'huawei') {
    return [
      `  PING ${host}: 56  data bytes, press CTRL_C to break`,
      `  Request time out`,
      `    --- ${host} ping statistics ---`,
      `    1 packet(s) transmitted, 0 packet(s) received, 100.00% packet loss`,
      `  -- ${why}`,
    ];
  }
  // linux-like (linux, openwrt, ubiquiti, vyos, fortinet, juniper)
  return [
    `PING ${host} (${host}) 56(84) bytes of data.`,
    `From ${host} icmp_seq=1 Destination Host Unreachable`,
    ``,
    `--- ${host} ping statistics ---`,
    `1 packets transmitted, 0 received, 100% packet loss, time ${rtt(0)}`,
    `  -- ${why}`,
  ];
}

/**
 * Format a real simulated ping result into vendor-flavored CLI output.
 */
export function formatPingOutput(
  vendorId: string,
  host: string,
  r: PingSimResult
): string {
  if (!r.success) return errorLines(vendorId, host, r).join('\n');

  const hops = Math.max(1, r.path.length - 1);
  const ttl = r.ttlAtDestination || 64;
  const ms = (i: number) =>
    hops === 0 ? '<1ms' : `${hops * 2 + (i % 3)}.${100 + (i * 137) % 900}ms`;

  if (vendorId === 'mikrotik') {
    const rows = [0, 1, 2]
      .map(
        (i) =>
          `  ${i} ${host.padEnd(40)} 56  ${ttl}  ${ms(i).padEnd(5)} echo reply`
      )
      .join('\n');
    return [
      `  SEQ HOST                                     SIZE TTL TIME  STATUS`,
      rows,
      `    sent=3 received=3 packet-loss=0% min-rtt=${ms(0)} avg-rtt=${ms(1)} max-rtt=${ms(2)}`,
      `  path: ${r.path.join(' -> ')}`,
    ].join('\n');
  }
  if (vendorId === 'cisco_ios' || vendorId === 'cisco_nxos' || vendorId === 'aruba') {
    return [
      `Type escape sequence to abort.`,
      `Sending 5, 100-byte ICMP Echos to ${host}, timeout is 2 seconds:`,
      `!!!!!`,
      `Success rate is 100 percent (5/5), round-trip min/avg/max = ${ms(0)}/${ms(1)}/${ms(2)} ms`,
      `  path: ${r.path.join(' -> ')}`,
    ].join('\n');
  }
  if (vendorId === 'huawei') {
    return [
      `  PING ${host}: 56  data bytes, press CTRL_C to break`,
      ...[0, 1].map((i) => `  Reply from ${host}: bytes=56 Sequence=${i + 1} ttl=${ttl} time=${ms(i)}`),
      `  --- ${host} ping statistics ---`,
      `  2 packet(s) transmitted, 2 packet(s) received, 0.00% packet loss`,
      `  round-trip min/avg/max = ${ms(0)}/${ms(1)}/${ms(2)} ms`,
      `  path: ${r.path.join(' -> ')}`,
    ].join('\n');
  }
  // linux-like
  return [
    `PING ${host} (${host}) 56(84) bytes of data.`,
    ...[0, 1, 2].map((i) => `64 bytes from ${host}: icmp_seq=${i + 1} ttl=${ttl} time=${ms(i)}`),
    ``,
    `--- ${host} ping statistics ---`,
    `3 packets transmitted, 3 received, 0% packet loss, time 2003ms`,
    `rtt min/avg/max/mdev = ${ms(0)}/${ms(1)}/${ms(2)}/0.010 ms`,
    `  path: ${r.path.join(' -> ')}`,
  ].join('\n');
}
