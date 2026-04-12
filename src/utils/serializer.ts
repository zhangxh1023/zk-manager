/**
 * Serialization utilities for ZNode data
 * Handles conversion between different formats (text, json, xml, hex, binary) and raw bytes
 */

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

// Parse formatted JSON string back to object, then return bytes
export function jsonToBytes(json: string): DeserializationResult {
  try {
    // First try to parse as-is (preserves formatting if user formatted it)
    const obj = JSON.parse(json);
    const str = JSON.stringify(obj);
    return { success: true, bytes: textToBytes(str) };
  } catch {
    // If it fails, try minifying
    try {
      const obj = JSON.parse(json.replace(/\s+/g, ' '));
      const str = JSON.stringify(obj);
      return { success: true, bytes: textToBytes(str) };
    } catch {
      return { success: false, error: 'Invalid JSON' };
    }
  }
}

// Parse formatted XML string back to bytes (preserves formatting)
export function xmlToBytes(xmlStr: string): DeserializationResult {
  try {
    // For XML, we just preserve the exact string as-is
    return { success: true, bytes: textToBytes(xmlStr) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Format bytes as JSON with indentation
export function bytesToJson(bytes: number[]): SerializationResult {
  const text = bytesToText(bytes);
  try {
    const obj = JSON.parse(text);
    return { success: true, data: JSON.stringify(obj, null, 2) };
  } catch {
    // If it's not valid JSON, just return as text
    return { success: true, data: text };
  }
}

// Format bytes as XML (basic formatting)
export function bytesToXml(bytes: number[]): SerializationResult {
  try {
    const text = bytesToText(bytes);
    // Basic XML formatting - add newlines after >< if the text contains XML
    const formatted = text.replace(/>\s*</g, '>\n<');
    return { success: true, data: formatted };
  } catch {
    return { success: true, data: bytesToText(bytes) };
  }
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
