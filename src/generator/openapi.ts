import * as fs from 'fs/promises';
import * as path from 'path';
import { fetchJson } from './http';
import { collectModels, writeModelsFiles } from './models';
import { buildOperationModel, collectOperations } from './operations';
import { buildTagFiles, writeBaseHttpFiles } from './requests';
import { resolveTagDirName, toCamelCase } from './utils';
import type { GenerateOptions, OperationModel } from './types';

export async function generateFromOpenApi(options: GenerateOptions) {
  const doc = await fetchJson(options.url);
  const operations = collectOperations(doc, {
    pathHidden: options.pathHidden,
    urlPrefix: options.urlPrefix
  });
  const models = collectModels(doc, {
    schemasPackageMap: options.schemasPackageMap,
    customModelFolder: options.customModelFolder
  });
  const modelLookup = new Map<string, string>();
  for (const model of models) {
    modelLookup.set(model.rawName, model.name);
    modelLookup.set(model.name, model.name);
  }

  const outputRoot = path.isAbsolute(options.outputDir)
    ? options.outputDir
    : path.join(options.workspaceRoot, options.outputDir);

  if (options.overwrite) {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
  await fs.mkdir(outputRoot, { recursive: true });
  await writeBaseHttpFiles(outputRoot);

  const tagMap = new Map<string, OperationModel[]>();
  for (const op of operations) {
    const model = buildOperationModel(op, modelLookup);
    for (const tag of op.tags) {
      const list = tagMap.get(tag) ?? [];
      list.push(model);
      tagMap.set(tag, list);
    }
  }

  if (models.length > 0) {
    await writeModelsFiles(models, outputRoot);
  }

  const tagExportPaths: string[] = [];
  for (const [tag, list] of tagMap.entries()) {
    const tagDirName = resolveTagDirName(tag, options.folderMap);
    const tagDir = path.join(outputRoot, tagDirName);
    await fs.mkdir(tagDir, { recursive: true });
    const { requestTs, requestDts } = buildTagFiles(list);
    await fs.writeFile(path.join(tagDir, 'request.ts'), requestTs, 'utf8');
    await fs.writeFile(path.join(tagDir, 'request.d.ts'), requestDts, 'utf8');
    tagExportPaths.push(`./${tagDirName}/request`);
  }

  const indexLines: string[] = [];
  const indexDtsLines: string[] = [];
  indexLines.push(`export * from './base_http';`);
  indexDtsLines.push(`export * from './base_http';`);
  if (models.length > 0) {
    indexLines.push(`export * as models from './models';`);
    indexDtsLines.push(`export * as models from './models';`);
  }
  for (const exportPath of tagExportPaths) {
    const alias = toCamelCase(path.basename(path.dirname(exportPath)));
    indexLines.push(`export * as ${alias} from '${exportPath}';`);
    indexDtsLines.push(`export * as ${alias} from '${exportPath}';`);
  }
  if (indexLines.length > 0) {
    await fs.writeFile(path.join(outputRoot, 'index.ts'), indexLines.join('\n') + '\n', 'utf8');
    await fs.writeFile(path.join(outputRoot, 'index.d.ts'), indexDtsLines.join('\n') + '\n', 'utf8');
  }

  return {
    tagCount: tagMap.size,
    operationCount: operations.length,
    outputRoot
  };
}
