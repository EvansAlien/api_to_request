import * as fs from 'fs/promises';
import * as path from 'path';
import { schemaToTs } from './schema';
import { normalizeModelName, sanitizeDirName, toCamelCase, toPosixPath } from './utils';
import type { ModelDef, ModelProperty } from './types';

export function collectModels(
  doc: any,
  options: { schemasPackageMap?: Record<string, string>; customModelFolder?: Record<string, string> } = {}
): ModelDef[] {
  const schemas = doc?.components?.schemas ?? {};
  const results: ModelDef[] = [];
  const schemasPackageMap = options.schemasPackageMap ?? {};
  const customModelFolder = options.customModelFolder ?? {};
  for (const [rawName, schema] of Object.entries(schemas)) {
    if (!schema || typeof schema !== 'object') {
      continue;
    }
    const props = (schema as any).properties ?? {};
    if (!props || typeof props !== 'object') {
      continue;
    }
    const requiredList = Array.isArray((schema as any).required) ? (schema as any).required : [];
    const properties: ModelProperty[] = [];
    for (const [propName, propSchema] of Object.entries(props)) {
      const camelName = toCamelCase(String(propName));
      const type = schemaToTs(propSchema, true);
      properties.push({
        name: camelName,
        originalName: String(propName),
        type,
        required: requiredList.includes(propName),
        description: (propSchema as any)?.description
      });
    }
    const folder = resolveModelFolder(String(rawName), schemasPackageMap, customModelFolder);
    results.push({
      rawName: String(rawName),
      name: normalizeModelName(String(rawName)),
      properties,
      folder
    });
  }
  return results;
}

export async function writeModelsFiles(models: ModelDef[], outputRoot: string) {
  const modelsRoot = path.join(outputRoot, 'models');
  await fs.mkdir(modelsRoot, { recursive: true });

  const modelNameSet = new Set(models.map((model) => model.name));
  const modelPathMap = new Map<string, string>();
  for (const model of models) {
    const folder = model.folder ? sanitizeDirName(model.folder) : '';
    const relPath = folder ? `${folder}/${model.name}` : model.name;
    modelPathMap.set(model.name, relPath);
  }

  const indexLines: string[] = [];
  const indexDtsLines: string[] = [];

  for (const model of models) {
    const relPath = modelPathMap.get(model.name)!;
    const fileDir = path.join(modelsRoot, path.dirname(relPath));
    await fs.mkdir(fileDir, { recursive: true });

    const importLines = buildModelImports(model, modelNameSet, modelPathMap, relPath);
    const classBody = buildModelClass(model, modelNameSet);
    const declareBody = buildModelDeclaration(model);

    await fs.writeFile(
      path.join(modelsRoot, `${relPath}.ts`),
      ['/* eslint-disable */', ...importLines, '', classBody].join('\n'),
      'utf8'
    );
    await fs.writeFile(
      path.join(modelsRoot, `${relPath}.d.ts`),
      [...importLines, '', declareBody].join('\n'),
      'utf8'
    );

    indexLines.push(`export * from './${relPath}';`);
    indexDtsLines.push(`export * from './${relPath}';`);
  }

  await fs.writeFile(path.join(modelsRoot, 'index.ts'), indexLines.join('\n') + '\n', 'utf8');
  await fs.writeFile(path.join(modelsRoot, 'index.d.ts'), indexDtsLines.join('\n') + '\n', 'utf8');
}

function buildModelImports(
  model: ModelDef,
  modelNameSet: Set<string>,
  modelPathMap: Map<string, string>,
  relPath: string
) {
  const deps = collectModelDependencies(model, modelNameSet);
  if (deps.size === 0) {
    return [];
  }
  const lines: string[] = [];
  for (const dep of deps) {
    const depPath = modelPathMap.get(dep);
    if (!depPath) {
      continue;
    }
    const from = toPosixPath(path.relative(path.dirname(relPath), depPath));
    const importPath = from.startsWith('.') ? from : `./${from}`;
    lines.push(`import { ${dep} } from '${importPath}';`);
  }
  return lines;
}

function collectModelDependencies(model: ModelDef, modelNameSet: Set<string>) {
  const deps = new Set<string>();
  for (const prop of model.properties) {
    if (modelNameSet.has(prop.type)) {
      deps.add(prop.type);
    } else if (prop.type.endsWith('[]')) {
      const itemType = prop.type.slice(0, -2);
      if (modelNameSet.has(itemType)) {
        deps.add(itemType);
      }
    }
  }
  return deps;
}

function buildModelClass(model: ModelDef, modelNameSet: Set<string>) {
  const lines: string[] = [];
  lines.push(`export class ${model.name} {`);

  for (const prop of model.properties) {
    if (prop.description) {
      lines.push(`  /** ${prop.description} */`);
    }
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type};`, '');
  }

  lines.push(`  constructor(data: Omit<${model.name}, 'toJson'>) {`);
  for (const prop of model.properties) {
    lines.push(`    this.${prop.name} = data.${prop.name};`);
  }
  lines.push('  }', '');

  lines.push(`  static fromJson(json: any): ${model.name} {`);
  lines.push('    return new ' + model.name + '({');
  for (const prop of model.properties) {
    const jsonValue = buildFromJsonValue(prop, modelNameSet);
    lines.push(`      ${prop.name}: ${jsonValue},`);
  }
  lines.push('    });');
  lines.push('  }', '');

  lines.push('  toJson(): any {');
  lines.push('    return {');
  for (const prop of model.properties) {
    const jsonValue = buildToJsonValue(prop, modelNameSet);
    lines.push(`      "${prop.originalName}": ${jsonValue},`);
  }
  lines.push('    };');
  lines.push('  }');
  lines.push('}', '');

  return lines.join('\n');
}

function buildModelDeclaration(model: ModelDef) {
  const lines: string[] = [];
  lines.push(`export declare class ${model.name} {`);
  for (const prop of model.properties) {
    if (prop.description) {
      lines.push(`  /** ${prop.description} */`);
    }
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type};`);
  }
  lines.push(`  constructor(data: Omit<${model.name}, 'toJson'>);`);
  lines.push(`  static fromJson(json: any): ${model.name};`);
  lines.push('  toJson(): any;');
  lines.push('}', '');
  return lines.join('\n');
}

function buildFromJsonValue(prop: ModelProperty, modelNameSet: Set<string>): string {
  if (modelNameSet.has(prop.type)) {
    return `${prop.type}.fromJson(json["${prop.originalName}"])`;
  }
  if (prop.type.endsWith('[]')) {
    const itemType = prop.type.slice(0, -2);
    if (modelNameSet.has(itemType)) {
      return `(json["${prop.originalName}"] ?? []).map((item: any) => ${itemType}.fromJson(item))`;
    }
  }
  return `json["${prop.originalName}"]`;
}

function buildToJsonValue(prop: ModelProperty, modelNameSet: Set<string>): string {
  if (modelNameSet.has(prop.type)) {
    return `this.${prop.name} ? this.${prop.name}.toJson() : this.${prop.name}`;
  }
  if (prop.type.endsWith('[]')) {
    const itemType = prop.type.slice(0, -2);
    if (modelNameSet.has(itemType)) {
      return `this.${prop.name} ? this.${prop.name}.map((item) => item.toJson()) : this.${prop.name}`;
    }
  }
  return `this.${prop.name}`;
}

function resolveModelFolder(
  rawName: string,
  schemasPackageMap: Record<string, string>,
  customModelFolder: Record<string, string>
): string {
  const normalizedRaw = String(rawName);
  if (customModelFolder[normalizedRaw]) {
    return customModelFolder[normalizedRaw];
  }
  const nameOnly = normalizeModelName(normalizedRaw);
  if (customModelFolder[nameOnly]) {
    return customModelFolder[nameOnly];
  }
  const packageName = normalizedRaw.split('.').slice(0, -1).join('.');
  if (schemasPackageMap[packageName] !== undefined) {
    return schemasPackageMap[packageName] ?? '';
  }
  return '';
}
