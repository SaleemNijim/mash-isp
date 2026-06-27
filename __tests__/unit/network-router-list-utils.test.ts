import { describe, expect, it } from 'vitest'
import {
  compareIpAddress,
  matchesNetworkRouterSearch,
  parseIpOctets,
} from '@/lib/network/router-list-utils'

describe('parseIpOctets', () => {
  it('parses valid IPv4', () => {
    expect(parseIpOctets('192.168.10.1')).toEqual([192, 168, 10, 1])
  })

  it('returns null for invalid IP', () => {
    expect(parseIpOctets('192.168.10')).toBeNull()
    expect(parseIpOctets('')).toBeNull()
  })
})

describe('compareIpAddress', () => {
  it('sorts numerically not lexicographically', () => {
    const ips = [
      '192.168.10.100',
      '192.168.10.1',
      '192.168.10.11',
      '192.168.10.2',
      '192.168.10.10',
    ]
    const sorted = [...ips].sort(compareIpAddress)
    expect(sorted).toEqual([
      '192.168.10.1',
      '192.168.10.2',
      '192.168.10.10',
      '192.168.10.11',
      '192.168.10.100',
    ])
  })
})

describe('matchesNetworkRouterSearch', () => {
  const row = {
    name: 'FUTUER WAY 1.10',
    ip_address: '192.168.10.10',
    mac_address: '68:FF:7B:3D:B2:8E',
    location: 'مطعم البيروتي',
    model: '10.1010',
    device_type: 'Router',
    phone: '598351006',
    notes: '',
  }

  it('matches partial IP', () => {
    expect(matchesNetworkRouterSearch(row, '10.10')).toBe(true)
  })

  it('matches MAC without colons', () => {
    expect(matchesNetworkRouterSearch(row, '68ff7b')).toBe(true)
  })

  it('matches SSID suffix', () => {
    expect(matchesNetworkRouterSearch(row, '1.10')).toBe(true)
  })

  it('returns true for empty query', () => {
    expect(matchesNetworkRouterSearch(row, '   ')).toBe(true)
  })
})
