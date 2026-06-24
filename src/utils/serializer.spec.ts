import { describe, it, expect } from 'vitest';
import {
  bytesToText,
  textToBytes,
  bytesToHex,
  hexToBytes,
  bytesToBinary,
  binaryToBytes,
  bytesToXml,
  formatStructuredText,
  jsonToBytes,
  xmlToBytes,
  bytesToJson,
} from './serializer';

describe('Serializer Utilities', () => {
  const sampleString = 'hello zk';
  const sampleBytes = [104, 101, 108, 108, 111, 32, 122, 107];
  
  describe('Text Conversion', () => {
    it('converts bytes to text correctly', () => {
      expect(bytesToText(sampleBytes)).toBe(sampleString);
    });

    it('converts text to bytes correctly', () => {
      expect(textToBytes(sampleString)).toEqual(sampleBytes);
    });
  });

  describe('Hex Conversion', () => {
    const hexString = '68 65 6c 6c 6f 20 7a 6b';

    it('converts bytes to hex string', () => {
      expect(bytesToHex(sampleBytes)).toBe(hexString);
    });

    it('converts hex string to bytes', () => {
      const result = hexToBytes(hexString);
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(sampleBytes);
    });

    it('handles uppercase hex strings and no spaces', () => {
      const result = hexToBytes('68656C6C6F207A6B');
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(sampleBytes);
    });

    it('fails on invalid hex string', () => {
      expect(hexToBytes('invalid hex').success).toBe(false);
      expect(hexToBytes('68 6').success).toBe(false); // odd length
    });
  });

  describe('Binary Conversion', () => {
    const binaryStr = '01101000 01100101 01101100 01101100 01101111 00100000 01111010 01101011';

    it('converts bytes to binary string', () => {
      expect(bytesToBinary(sampleBytes)).toBe(binaryStr);
    });

    it('converts binary string to bytes', () => {
      const result = binaryToBytes(binaryStr);
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(sampleBytes);
    });

    it('fails on invalid binary', () => {
      expect(binaryToBytes('12345').success).toBe(false);
      expect(binaryToBytes('01').success).toBe(false); // length not multiple of 8
    });
  });

  describe('JSON Conversion', () => {
    const obj = { key: 'value', num: 123 };
    const jsonStr = '{\n  "key": "value",\n  "num": 123\n}';
    const jsonBytes = Array.from(new TextEncoder().encode(JSON.stringify(obj)));

    it('formats bytes to JSON string', () => {
      const result = bytesToJson(jsonBytes);
      expect(result.success).toBe(true);
      // bytesToJson stringifies with 2 spaces indents
      expect(result.data).toBe(JSON.stringify(obj, null, 2));
    });

    it('parses formatted JSON back to bytes', () => {
      const result = jsonToBytes(jsonStr);
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(jsonBytes);
    });

    it('fails gracefully on invalid JSON', () => {
      expect(jsonToBytes('{invalid}').success).toBe(false);
      // bytesToJson returns text if invalid
      const invalidBytes = textToBytes('invalid json');
      expect(bytesToJson(invalidBytes).data).toBe('invalid json');
    });
  });

  describe('Structured Text Formatting', () => {
    it('formats valid JSON and rejects invalid JSON', () => {
      expect(formatStructuredText('{"nested":{"value":1}}', 'json')).toEqual({
        success: true,
        data: '{\n  "nested": {\n    "value": 1\n  }\n}',
      });
      expect(formatStructuredText('{invalid}', 'json')).toEqual({
        success: false,
        error: 'Invalid JSON',
      });
    });

    it('formats valid XML and rejects malformed XML', () => {
      expect(formatStructuredText('<root><child>value</child></root>', 'xml')).toEqual({
        success: true,
        data: '<root>\n  <child>\n    value\n  </child>\n</root>',
      });
      expect(formatStructuredText('<root><child></root>', 'xml')).toEqual({
        success: false,
        error: 'Invalid XML',
      });
    });

    it('validates XML when saving while preserving the entered text', () => {
      const xml = '<root>\n  <child />\n</root>';
      expect(xmlToBytes(xml)).toEqual({
        success: true,
        bytes: textToBytes(xml),
      });
      expect(xmlToBytes('<root>')).toEqual({
        success: false,
        error: 'Invalid XML',
      });
    });

    it('keeps invalid XML editable when displaying it', () => {
      const invalidXml = '<root>';
      expect(bytesToXml(textToBytes(invalidXml))).toEqual({
        success: true,
        data: invalidXml,
      });
    });
  });
});
