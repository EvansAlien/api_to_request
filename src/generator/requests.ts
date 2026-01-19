import * as fs from 'fs/promises';
import * as path from 'path';
import type { BaseHttpConfig, OperationModel, ParameterInfo } from './types';
import { toPascalCase } from './utils';

export async function writeBaseHttpFiles(outputRoot: string, config?: BaseHttpConfig) {
  const baseHttpPath = path.join(outputRoot, 'base_http.ts');
  const baseHttpDtsPath = path.join(outputRoot, 'base_http.d.ts');
  const importLines = buildBaseHttpImports(config);
  const pageRespLines = buildPageRespLines(config);
  const requestTemplate = buildRequestTemplate(config);
  const baseLines = [
    '/* eslint-disable */',
    ...importLines,
    '',
    'export type RequestOptions = {',
    '  method: string;',
    '  url: string;',
    '  params?: Record<string, any>;',
    '  data?: any;',
    '};',
    '',
    ...pageRespLines,
    '',
    "export const BASE_URL = '';",
    '',
    'export function buildQuery(params?: Record<string, any>): string {',
    '  if (!params) {',
    "    return '';",
    '  }',
    '  const query = Object.entries(params)',
    '    .filter(([, value]) => value !== undefined && value !== null)',
    "    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)",
    "    .join('&');",
    "  return query ? `?${query}` : '';",
    '}',
    '',
    'export function applyPathParams(urlTemplate: string, params: Record<string, any>): string {',
    "  return urlTemplate.replace(/\\{(\\w+)\\}/g, (_, key) => encodeURIComponent(String(params[key])));",
    '}',
    '',
    requestTemplate,
    ''
  ];

  const dtsLines = [
    'export type RequestOptions = {',
    '  method: string;',
    '  url: string;',
    '  params?: Record<string, any>;',
    '  data?: any;',
    '};',
    '',
    ...pageRespLines,
    '',
    'export const BASE_URL: string;',
    '',
    'export function buildQuery(params?: Record<string, any>): string;',
    'export function applyPathParams(urlTemplate: string, params: Record<string, any>): string;',
    'export function request<T>(options: RequestOptions): Promise<T>;',
    ''
  ];

  await fs.writeFile(baseHttpPath, baseLines.join('\n'), 'utf8');
  await fs.writeFile(baseHttpDtsPath, dtsLines.join('\n'), 'utf8');
}

function buildBaseHttpImports(config?: BaseHttpConfig): string[] {
  const lines: string[] = [];
  if (config?.template === 'axios') {
    lines.push("import axios from 'axios';");
  }
  if (config?.customImports) {
    lines.push(...splitTemplateLines(config.customImports));
  }
  return lines.length > 0 ? [...lines, ''] : [];
}

function buildPageRespLines(config?: BaseHttpConfig): string[] {
  if (config?.pageResp?.trim()) {
    return splitTemplateLines(config.pageResp);
  }
  return [
    'export interface PageData<T> {',
    '  list: T[];',
    '  page: number;',
    '  size: number;',
    '  total: number;',
    '}',
    '',
    'export interface PageResp<T> {',
    '  data: PageData<T>;',
    '}'
  ];
}

function buildRequestTemplate(config?: BaseHttpConfig): string {
  const custom = config?.requestTemplate?.trim();
  if (custom) {
    return custom;
  }
  if (config?.template === 'axios') {
    return [
      'export async function request<T>(options: RequestOptions): Promise<T> {',
      '  const response = await axios.request<T>({',
      '    method: options.method,',
      '    url: options.url,',
      '    params: options.params,',
      '    data: options.data,',
      '    baseURL: BASE_URL',
      '  });',
      '  return response.data;',
      '}'
    ].join('\n');
  }
  return [
    'export async function request<T>(options: RequestOptions): Promise<T> {',
    '  const url = `${BASE_URL}${options.url}${buildQuery(options.params)}`;',
    '  const response = await fetch(url, {',
    '    method: options.method,',
    "    headers: { 'Content-Type': 'application/json' },",
    '    body: options.data !== undefined ? JSON.stringify(options.data) : undefined',
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`请求失败: ${response.status} ${response.statusText}`);',
    '  }',
    '  return (await response.json()) as T;',
    '}'
  ].join('\n');
}

function splitTemplateLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

export function buildTagFiles(operations: OperationModel[]) {
  const usedNames = new Map<string, number>();
  const normalized = operations.map((op) => {
    const count = usedNames.get(op.name) ?? 0;
    usedNames.set(op.name, count + 1);
    if (count === 0) {
      return op;
    }
    return {
      ...op,
      name: `${op.name}${count + 1}`
    };
  });

  const typeLines: string[] = [];
  const funcLines: string[] = [];
  const dtsLines: string[] = [];
  const needsModels = normalized.some((op) => Boolean(op.bodyModel || op.responseModel));
  const needsPageResp = normalized.some((op) => op.responseWrapper === 'PageResp');

  typeLines.push('/* eslint-disable */\n');
  typeLines.push(
    `import { applyPathParams, request${needsPageResp ? ', PageResp' : ''} } from '../base_http';\n\n`
  );
  if (needsModels) {
    typeLines.push("import * as models from '../models';\n\n");
  }

  if (needsModels) {
    dtsLines.push("import * as models from '../models';\n\n");
  }

  for (const op of normalized) {
    const pascal = toPascalCase(op.name);
    const pathInterface = `${pascal}PathParams`;
    const queryInterface = `${pascal}QueryParams`;
    const bodyInterface = `${pascal}Body`;

    if (op.pathParams.length > 1) {
      typeLines.push(buildInterface(pathInterface, op.pathParams));
      dtsLines.push(buildInterface(pathInterface, op.pathParams));
    }
    if (op.queryParams.length > 0) {
      typeLines.push(buildInterface(queryInterface, op.queryParams));
      dtsLines.push(buildInterface(queryInterface, op.queryParams));
    }
    if (op.hasBody && !op.bodyModel) {
      typeLines.push(`export interface ${bodyInterface} {\n  [key: string]: any;\n}\n\n`);
      dtsLines.push(`export interface ${bodyInterface} {\n  [key: string]: any;\n}\n\n`);
    }

    const fnSignature = buildFunctionSignature(op, pascal, pathInterface, queryInterface, bodyInterface);
    funcLines.push(fnSignature.impl);
    dtsLines.push(fnSignature.declare);
  }

  return {
    requestTs: `${typeLines.join('')}\n${funcLines.join('\n')}`,
    requestDts: dtsLines.join('')
  };
}

function buildFunctionSignature(
  op: OperationModel,
  pascal: string,
  pathInterface: string,
  queryInterface: string,
  bodyInterface: string
) {
  const args: string[] = [];
  if (op.pathParams.length === 1) {
    const param = op.pathParams[0];
    args.push(`${param.name}: ${param.type}`);
  } else if (op.pathParams.length > 1) {
    args.push(`pathParams: ${pathInterface}`);
  }
  if (op.queryParams.length > 0) {
    args.push(`params${op.queryParams.some((p) => p.required) ? '' : '?'}: ${queryInterface}`);
  }
  if (op.hasBody) {
    if (op.bodyModel) {
      args.push(`body: models.${op.bodyModel}`);
    } else {
      args.push(`body?: ${bodyInterface}`);
    }
  }

  const urlExpr =
    op.pathParams.length > 1
      ? `applyPathParams('${op.path}', pathParams)`
      : op.pathParams.length === 1
        ? `applyPathParams('${op.path}', { ${op.pathParams[0].name} })`
        : `'${op.path}'`;

  const bodyLine = op.hasBody
    ? op.bodyModel
      ? `, data: body.toJson()`
      : `, data: body`
    : '';
  const paramsLine = op.queryParams.length > 0 ? `, params` : '';

  const returnType = op.responseModel
    ? normalizeReturnType(op.responseModel, op.responseWrapper)
    : 'any';
  const bodyType = buildBodyType(op, bodyInterface);
  const docLines = buildDocComment(op, returnType, bodyType);
  const impl = `${docLines}export async function ${op.name}(${args.join(', ')}): Promise<${returnType}> {\n  const url = ${urlExpr};\n  return request<${returnType}>({ method: '${op.method}', url${paramsLine}${bodyLine} });\n}\n`;

  const declareArgs = args.join(', ');
  const declare = `${docLines}export declare function ${op.name}(${declareArgs}): Promise<${returnType}>;\n\n`;

  return { impl, declare };
}

function normalizeReturnType(typeName: string, wrapper?: 'PageResp'): string {
  if (typeName.endsWith('[]')) {
    const base = typeName.slice(0, -2);
    const inner = `models.${base}[]`;
    return wrapper ? `${wrapper}<${inner}>` : inner;
  }
  if (typeName.startsWith('models.')) {
    return wrapper ? `${wrapper}<${typeName}>` : typeName;
  }
  const inner = `models.${typeName}`;
  return wrapper ? `${wrapper}<${inner}>` : inner;
}

function buildBodyType(op: OperationModel, bodyInterface: string): string | undefined {
  if (!op.hasBody) {
    return undefined;
  }
  if (op.bodyModel) {
    return `models.${op.bodyModel}`;
  }
  return bodyInterface;
}

function buildDocComment(
  op: OperationModel,
  returnType: string,
  bodyType?: string
): string {
  const safeSummary = op.summary?.trim();
  const lines = ['/**'];
  if (safeSummary) {
    lines.push(` * ${safeSummary}`);
  }
  if (op.pathParams.length > 0 || op.queryParams.length > 0 || bodyType) {
    lines.push(' *', ' * parameters');
  }
  for (const param of op.pathParams) {
    const typeName = `${param.type}${param.required ? '' : '?'}`;
    const desc = param.description ? `: ${param.description}` : '';
    lines.push(` * @pathParam {${typeName}} ${param.name}${desc}`);
  }
  for (const param of op.queryParams) {
    const typeName = `${param.type}${param.required ? '' : '?'}`;
    const desc = param.description ? `: ${param.description}` : '';
    lines.push(` * @queryParam {${typeName}} ${param.name}${desc}`);
  }
  if (bodyType) {
    lines.push(` * @bodyParam {${bodyType}} body`);
  }
  lines.push(` * @return {${returnType}}`);
  lines.push(' */', '');
  return lines.join('\n');
}

function buildInterface(name: string, params: ParameterInfo[]) {
  const lines = params.map((param) => {
    const optional = param.required ? '' : '?';
    return `  ${param.name}${optional}: ${param.type};`;
  });
  return `export interface ${name} {\n${lines.join('\n')}\n}\n\n`;
}
