import { schemaToTs } from './schema';
import { normalizeModelName, resolveRefName, toCamelCase } from './utils';
import type { Operation, OperationModel, ParameterInfo } from './types';

export function collectOperations(
  doc: any,
  options: { pathHidden?: string[]; urlPrefix?: string } = {}
): Operation[] {
  const results: Operation[] = [];
  const hidden = new Set(options.pathHidden ?? []);
  const prefix = normalizeUrlPrefix(options.urlPrefix);
  const paths = doc?.paths ?? {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    if (hidden.has(pathKey)) {
      continue;
    }
    const sharedParams = Array.isArray((pathItem as any).parameters)
      ? (pathItem as any).parameters
      : [];
    for (const [method, operation] of Object.entries(pathItem as any)) {
      const op = operation as any;
      if (!isHttpMethod(method) || !op) {
        continue;
      }
      const operationPath = prefix ? joinPath(prefix, pathKey) : pathKey;
      const tags = Array.isArray(op.tags) && op.tags.length > 0 ? op.tags : ['default'];
      const parameters = [...sharedParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      results.push({
        method: method as Operation['method'],
        path: operationPath,
        summary: op.summary,
        operationId: op.operationId,
        tags,
        parameters,
        requestBody: op.requestBody,
        responses: op.responses
      });
    }
  }
  return results;
}

export function buildOperationModel(
  op: Operation,
  modelLookup: Map<string, string>
): OperationModel {
  const name = buildOperationName(op);
  const params = collectParameters(op.parameters);
  const bodyModel = resolveBodyModel(op.requestBody, modelLookup);
  const responseInfo = resolveResponseModel(op.responses, modelLookup);
  const hasBody = Boolean(op.requestBody);
  return {
    name,
    method: op.method.toUpperCase(),
    path: op.path,
    summary: op.summary,
    pathParams: params.pathParams,
    queryParams: params.queryParams,
    hasBody,
    bodyModel,
    responseModel: responseInfo?.model,
    responseWrapper: responseInfo?.wrapper
  };
}

export function collectParameters(parameters: any[]) {
  const pathParams: ParameterInfo[] = [];
  const queryParams: ParameterInfo[] = [];
  for (const param of parameters) {
    if (!param || typeof param !== 'object') {
      continue;
    }
    if (param.$ref) {
      continue;
    }
    const location = param.in as ParameterInfo['location'];
    if (location !== 'path' && location !== 'query') {
      continue;
    }
    const type = schemaToTs(param.schema);
    const info: ParameterInfo = {
      name: param.name,
      location,
      required: Boolean(param.required),
      type,
      description: param.description
    };
    if (location === 'path') {
      pathParams.push(info);
    } else if (location === 'query') {
      queryParams.push(info);
    }
  }
  return { pathParams, queryParams };
}

export function resolveBodyModel(
  requestBody: any,
  modelLookup: Map<string, string>
): string | undefined {
  if (!requestBody || typeof requestBody !== 'object') {
    return undefined;
  }
  const content = requestBody.content ?? {};
  for (const media of Object.values(content)) {
    if (!media || typeof media !== 'object') {
      continue;
    }
    const schema = (media as any).schema;
    if (!schema || typeof schema !== 'object') {
      continue;
    }
    if (schema.$ref) {
      const refName = resolveRefName(String(schema.$ref));
      return modelLookup.get(refName);
    }
  }
  return undefined;
}

export function resolveResponseModel(
  responses: any,
  modelLookup: Map<string, string>
): { model?: string; wrapper?: 'PageResp' } | undefined {
  if (!responses || typeof responses !== 'object') {
    return undefined;
  }
  const response = responses['200'] ?? responses['201'] ?? responses['default'] ?? firstResponse(responses);
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const content = response.content ?? {};
  for (const media of Object.values(content)) {
    if (!media || typeof media !== 'object') {
      continue;
    }
    const schema = (media as any).schema;
    if (!schema || typeof schema !== 'object') {
      continue;
    }
    const hasList = hasListItems(schema);
    if (hasList) {
      const listModel = findListItemModel(schema, modelLookup);
      if (listModel) {
        return { model: `${listModel}[]`, wrapper: 'PageResp' };
      }
    }
    const modelName = extractResponseModel(schema, modelLookup);
    if (modelName) {
      return { model: modelName };
    }
  }
  return undefined;
}

function extractResponseModel(schema: any, modelLookup: Map<string, string>): string | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }

  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword])) {
      const candidates: string[] = [];
      for (const item of schema[keyword]) {
        const modelName = extractResponseModel(item, modelLookup);
        if (modelName) {
          candidates.push(modelName);
        }
      }
      return pickPreferredResponse(candidates);
    }
  }

  if (schema.properties?.list?.items) {
    const listModel = extractResponseModel(schema.properties.list.items, modelLookup);
    if (listModel) {
      return `${listModel}[]`;
    }
  }

  if (schema.properties?.data) {
    const dataModel = extractResponseModel(schema.properties.data, modelLookup);
    if (dataModel) {
      return dataModel;
    }
  }

  if (schema.$ref) {
    const refName = resolveRefName(String(schema.$ref));
    return modelLookup.get(refName);
  }

  if (schema.type === 'array' && schema.items) {
    const itemModel = extractResponseModel(schema.items, modelLookup);
    if (itemModel) {
      return `${itemModel}[]`;
    }
  }

  return undefined;
}

function firstResponse(responses: Record<string, any>) {
  const key = Object.keys(responses)[0];
  return key ? responses[key] : undefined;
}

function pickPreferredResponse(candidates: string[]): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const arrayType = candidates.find((name) => name.endsWith('[]'));
  if (arrayType) {
    return arrayType;
  }
  const nonResponse = candidates.find((name) => !isGenericResponse(name));
  return nonResponse ?? candidates[0];
}

function isGenericResponse(name: string): boolean {
  const clean = name.replace(/\[\]$/, '');
  return (
    clean === 'Response' ||
    clean.endsWith('Response') ||
    clean === 'PageData' ||
    clean.endsWith('PageData')
  );
}

function pickPreferredListModel(candidates: string[]): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const nonGeneric = candidates.find((name) => !isGenericResponse(name));
  return nonGeneric ?? candidates[0];
}

function findPageDataRef(schema: any): string | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  if (schema.$ref) {
    const refName = resolveRefName(String(schema.$ref));
    if (refName === 'PageData' || refName.endsWith('PageData')) {
      return refName;
    }
  }
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword])) {
      for (const item of schema[keyword]) {
        const found = findPageDataRef(item);
        if (found) {
          return found;
        }
      }
    }
  }
  if (schema.properties?.data) {
    return findPageDataRef(schema.properties.data);
  }
  return undefined;
}

function findListItemModel(schema: any, modelLookup: Map<string, string>): string | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  const candidates: string[] = [];

  const collect = (value: any) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (value.properties?.list?.items) {
      const modelName = extractResponseModel(value.properties.list.items, modelLookup);
      if (modelName) {
        candidates.push(modelName.replace(/\[\]$/, ''));
      }
    }
    if (value.properties?.data) {
      collect(value.properties.data);
    }
    for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
      if (Array.isArray(value[keyword])) {
        for (const item of value[keyword]) {
          collect(item);
        }
      }
    }
  };

  collect(schema);
  return pickPreferredListModel(candidates);
}

function hasListItems(schema: any): boolean {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  if (schema.properties?.list?.items) {
    return true;
  }
  if (schema.properties?.data && hasListItems(schema.properties.data)) {
    return true;
  }
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword])) {
      for (const item of schema[keyword]) {
        if (hasListItems(item)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function buildOperationName(op: Operation): string {
  if (op.operationId && /[A-Za-z0-9]/.test(op.operationId)) {
    return toCamelCase(op.operationId);
  }
  if (op.summary && /[A-Za-z0-9]/.test(op.summary)) {
    return toCamelCase(op.summary);
  }
  const tokens = op.path
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[{}]/g, ''))
    .map((segment) => segment.split(/[^A-Za-z0-9]+/))
    .flat()
    .filter(Boolean);
  const base = [op.method, ...tokens].join(' ');
  return toCamelCase(base || `${op.method}Api`);
}

function normalizeUrlPrefix(prefix?: string): string {
  if (!prefix) {
    return '';
  }
  let value = prefix.trim();
  if (!value) {
    return '';
  }
  if (!value.startsWith('/')) {
    value = `/${value}`;
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function joinPath(prefix: string, pathValue: string): string {
  const normalized = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return `${prefix}${normalized}`;
}

function isHttpMethod(method: string): method is Operation['method'] {
  return ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method);
}
