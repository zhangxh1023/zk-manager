import { describe, it, expect } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToText,
  textToBytes,
  bytesToHex,
  hexToBytes,
  bytesToBinary,
  binaryToBytes,
  bytesToXml,
  detectSerializationFormat,
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

  describe('Base64 Conversion', () => {
    const bytes = [0, 255, 16, 104, 105];
    const base64 = 'AP8QaGk=';

    it('converts bytes to base64 string', () => {
      expect(bytesToBase64(bytes)).toBe(base64);
    });

    it('converts base64 string to bytes', () => {
      const result = base64ToBytes(base64);
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(bytes);
    });

    it('allows whitespace in base64 text', () => {
      const result = base64ToBytes('AP8Q\n aGk=');
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(bytes);
    });

    it('fails on invalid base64 text', () => {
      expect(base64ToBytes('not base64!').success).toBe(false);
      expect(base64ToBytes('abc').success).toBe(false);
    });
  });

  describe('Format Detection', () => {
    it('detects JSON objects and arrays', () => {
      expect(detectSerializationFormat(textToBytes('{"key":"value"}'))).toBe('json');
      expect(detectSerializationFormat(textToBytes('[1,2,3]'))).toBe('json');
    });

    it('keeps JSON scalars as text', () => {
      expect(detectSerializationFormat(textToBytes('123'))).toBe('text');
      expect(detectSerializationFormat(textToBytes('true'))).toBe('text');
      expect(detectSerializationFormat(textToBytes('"hello"'))).toBe('text');
    });

    it('detects XML text', () => {
      expect(detectSerializationFormat(textToBytes('<root><child>value</child></root>'))).toBe('xml');
    });

    it('falls back to text for plain text', () => {
      expect(detectSerializationFormat(textToBytes('hello zk'))).toBe('text');
    });

    it('does not auto-detect base64-looking text as base64', () => {
      expect(detectSerializationFormat(textToBytes('aGk='))).toBe('text');
    });

    it('falls back to binary for invalid UTF-8 bytes', () => {
      expect(detectSerializationFormat([0xff])).toBe('binary');
    });

    it('falls back to binary for valid UTF-8 with binary control characters', () => {
      expect(detectSerializationFormat([65, 0, 66])).toBe('binary');
    });
  });

  describe('JSON Conversion', () => {
    const obj = { key: 'value', num: 123 };
    const jsonStr = '{\n  "key": "value",\n  "num": 123\n}';
    const jsonBytes = textToBytes(JSON.stringify(obj));

    it('formats bytes to JSON string', () => {
      const result = bytesToJson(jsonBytes);
      expect(result.success).toBe(true);
      // bytesToJson stringifies with 2 spaces indents
      expect(result.data).toBe(JSON.stringify(obj, null, 2));
    });

    it('converts JSON text to bytes without validating or minifying', () => {
      const result = jsonToBytes(jsonStr);
      expect(result.success).toBe(true);
      expect(result.bytes).toEqual(textToBytes(jsonStr));
    });

    it('allows invalid JSON text when saving', () => {
      expect(jsonToBytes('{invalid}')).toEqual({
        success: true,
        bytes: textToBytes('{invalid}'),
      });
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

    it('converts XML text to bytes without validating', () => {
      const xml = '<root>\n  <child />\n</root>';
      expect(xmlToBytes(xml)).toEqual({
        success: true,
        bytes: textToBytes(xml),
      });
      expect(xmlToBytes('<root>')).toEqual({
        success: true,
        bytes: textToBytes('<root>'),
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
