import { normalizeModelName, resolveRefName } from './utils';

export function schemaToTs(schema: any, useRef = false): string {
  if (!schema || typeof schema !== 'object') {
    return 'any';
  }
  if (schema.$ref) {
    if (!useRef) {
      return 'any';
    }
    return normalizeModelName(resolveRefName(String(schema.$ref)));
  }
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (schema.items) {
        const itemType = schemaToTs(schema.items, useRef);
        return `${itemType}[]`;
      }
      return 'any[]';
    case 'object':
      return 'Record<string, any>';
    default:
      return 'any';
  }
}
