import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';
import { generateFromOpenApi } from '../generator/openapi';

interface SwaggerConfig {
  jsonUrl?: string;
  outputDir?: string;
  overwrite?: boolean;
  pathHidden?: string[];
  urlPrefix?: string;
  schemasPackageMap?: Record<string, string>;
  customModelFolder?: Record<string, string>;
  folderMap?: Record<string, string>;
}

export function registerCommands(context: vscode.ExtensionContext) {
  const hello = vscode.commands.registerCommand('extension.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from VSCode Extension!');
  });

  const generate = vscode.commands.registerCommand('extension.generateRequests', async () => {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      vscode.window.showErrorMessage('未找到工作区，请先打开一个文件夹。');
      return;
    }

    const configPath = path.join(workspace.uri.fsPath, 'zorycode.yaml');
    const swaggerConfig = await readSwaggerConfig(configPath);
    const configList = normalizeSwaggerConfigList(swaggerConfig);

    if (configList.length === 0) {
      const url = await vscode.window.showInputBox({
        title: 'OpenAPI JSON 地址',
        value: 'http://127.0.0.1:4523/export/openapi/2?version=3.0',
        prompt: '请输入 OpenAPI JSON 的 URL 地址'
      });
      if (!url) {
        return;
      }

      const outputDir = await vscode.window.showInputBox({
        title: '输出目录',
        value: 'generated-api',
        prompt: '相对于工作区根目录的输出路径'
      });
      if (!outputDir) {
        return;
      }

      await runGenerateOnce(workspace.uri.fsPath, { jsonUrl: url, outputDir });
      return;
    }

    const results: string[] = [];
    for (const item of configList) {
      try {
        const result = await runGenerateOnce(workspace.uri.fsPath, item);
        results.push(`✓ ${result.outputRoot}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push(`✗ ${item.outputDir ?? 'unknown'}：${message}`);
      }
    }

    vscode.window.showInformationMessage(
      `生成完成：${results.join(' | ')}`
    );
  });

  context.subscriptions.push(hello, generate);
}

async function readSwaggerConfig(configPath: string): Promise<SwaggerConfig | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const doc = parseYaml(raw);
    const swagger = doc?.swagger ?? null;
    return swagger as SwaggerConfig | null;
  } catch (error) {
    return null;
  }
}

function normalizeSwaggerConfigList(swagger: any): SwaggerConfig[] {
  if (!swagger) {
    return [];
  }
  if (Array.isArray(swagger)) {
    return swagger.filter(Boolean);
  }
  if (Array.isArray(swagger.items)) {
    return swagger.items.filter(Boolean);
  }
  return [swagger as SwaggerConfig];
}

async function runGenerateOnce(workspaceRoot: string, config: SwaggerConfig) {
  if (!config.jsonUrl || !config.outputDir) {
    throw new Error('jsonUrl 或 outputDir 为空');
  }
  return generateFromOpenApi({
    url: config.jsonUrl,
    workspaceRoot,
    outputDir: path.normalize(config.outputDir),
    overwrite: config.overwrite,
    pathHidden: config.pathHidden,
    urlPrefix: config.urlPrefix,
    schemasPackageMap: config.schemasPackageMap,
    customModelFolder: config.customModelFolder,
    folderMap: config.folderMap
  });
}
