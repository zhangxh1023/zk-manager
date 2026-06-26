/**
 * Serialization utilities for ZNode data
 * Handles conversion between different formats (text, json, xml, hex, binary) and raw bytes
 */

import xmlFormatter from 'xml-formatter';

export type SerializationFormat = 'text' | 'json' | 'xml' | 'hex' | 'binary';

export interface SerializationResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface DeserializationResult {
  success: boolean;
  bytes?: number[];
  error?: string;
}

export function formatStructuredText(
  input: string,
  format: Extract<SerializationFormat, 'json' | 'xml'>,
): SerializationResult {
  try {
    if (format === 'json') {
      return { success: true, data: JSON.stringify(JSON.parse(input), null, 2) };
    }

    return {
      success: true,
      data: xmlFormatter(input, {
        indentation: '  ',
        lineSeparator: '\n',
        strictMode: true,
      }),
    };
  } catch {
    return { success: false, error: `Invalid ${format.toUpperCase()}` };
  }
}

// Convert raw bytes to string using TextDecoder
export function bytesToText(bytes: number[]): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(bytes));
}

// Convert string to raw bytes using TextEncoder
export function textToBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

// Bytes to Hex string (space-separated)
export function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
}

// Hex string to bytes
export function hexToBytes(hex: string): DeserializationResult {
  try {
    // Remove all whitespace and validate hex
    const cleanHex = hex.replace(/\s+/g, '');
    if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
      return { success: false, error: 'Invalid hex characters' };
    }
    if (cleanHex.length % 2 !== 0) {
      return { success: false, error: 'Hex string must have even length' };
    }
    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }
    return { success: true, bytes };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Bytes to Binary string (space-separated per byte)
export function bytesToBinary(bytes: number[]): string {
  return bytes.map(b => b.toString(2).padStart(8, '0')).join(' ');
}

// Binary string to bytes
export function binaryToBytes(binary: string): DeserializationResult {
  try {
    // Remove all whitespace
    const cleanBinary = binary.replace(/\s+/g, '');
    if (!/^[01]*$/.test(cleanBinary)) {
      return { success: false, error: 'Invalid binary characters' };
    }
    if (cleanBinary.length % 8 !== 0) {
      return { success: false, error: 'Binary string must be multiple of 8 bits' };
    }
    const bytes: number[] = [];
    for (let i = 0; i < cleanBinary.length; i += 8) {
      bytes.push(parseInt(cleanBinary.substr(i, 8), 2));
    }
    return { success: true, bytes };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Convert JSON viewer text to bytes without validating, so save never blocks edits.
export function jsonToBytes(json: string): DeserializationResult {
  return { success: true, bytes: textToBytes(json) };
}

// Convert XML viewer text to bytes without validating, so save never blocks edits.
export function xmlToBytes(xmlStr: string): DeserializationResult {
  return { success: true, bytes: textToBytes(xmlStr) };
}

// Format bytes as JSON with indentation
export function bytesToJson(bytes: number[]): SerializationResult {
  const text = bytesToText(bytes);
  const result = formatStructuredText(text, 'json');
  // Keep invalid content editable after switching to the JSON viewer.
  return result.success ? result : { success: true, data: text };
}

// Format bytes as XML
export function bytesToXml(bytes: number[]): SerializationResult {
  const text = bytesToText(bytes);
  const result = formatStructuredText(text, 'xml');
  // Keep invalid content editable after switching to the XML viewer.
  return result.success ? result : { success: true, data: text };
}

// Convert bytes to displayable string for a given format
export function formatBytes(bytes: number[], format: SerializationFormat): SerializationResult {
  switch (format) {
    case 'text':
      return { success: true, data: bytesToText(bytes) };
    case 'json':
      return bytesToJson(bytes);
    case 'xml':
      return bytesToXml(bytes);
    case 'hex':
      return { success: true, data: bytesToHex(bytes) };
    case 'binary':
      return { success: true, data: bytesToBinary(bytes) };
    default:
      return { success: false, error: `Unknown format: ${format}` };
  }
}

// Convert displayable string back to bytes for a given format
export function parseBytes(input: string, format: SerializationFormat): DeserializationResult {
  switch (format) {
    case 'text':
      return { success: true, bytes: textToBytes(input) };
    case 'json':
      return jsonToBytes(input);
    case 'xml':
      return xmlToBytes(input);
    case 'hex':
      return hexToBytes(input);
    case 'binary':
      return binaryToBytes(input);
    default:
      return { success: false, error: `Unknown format: ${format}` };
  }
}
