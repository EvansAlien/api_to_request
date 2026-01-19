import * as path from 'path';
import { pinyin } from 'pinyin-pro';

export function toCamelCase(input: string): string {
  const words = input.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return 'api';
  }
  const [first, ...rest] = words;
  return first.toLowerCase() + rest.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
}

export function toPascalCase(input: string): string {
  const camel = toCamelCase(input);
  return camel[0].toUpperCase() + camel.slice(1);
}

export function resolveRefName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1] ?? ref;
}

export function normalizeModelName(rawName: string): string {
  const name = rawName.split('.').pop() ?? rawName;
  return toPascalCase(name);
}

export function sanitizeDirName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9-_]/g, '-').replace(/-+/g, '-');
  return cleaned || 'default';
}

export function resolveTagDirName(tag: string, folderMap?: Record<string, string>): string {
  if (folderMap && folderMap[tag]) {
    return sanitizeDirName(folderMap[tag]);
  }
  if (hasCjk(tag)) {
    const romanized = pinyin(tag, { toneType: 'none', type: 'array' }).join('-');
    return sanitizeDirName(romanized);
  }
  return sanitizeDirName(tag);
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function hasCjk(value: string): boolean {
  return /[\u4E00-\u9FFF]/.test(value);
}
