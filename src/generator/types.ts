export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export interface GenerateOptions {
  url: string;
  workspaceRoot: string;
  outputDir: string;
  overwrite?: boolean;
  pathHidden?: string[];
  urlPrefix?: string;
  schemasPackageMap?: Record<string, string>;
  customModelFolder?: Record<string, string>;
  folderMap?: Record<string, string>;
}

export interface Operation {
  method: HttpMethod;
  path: string;
  summary?: string;
  operationId?: string;
  tags: string[];
  parameters: any[];
  requestBody?: any;
  responses?: any;
}

export interface ParameterInfo {
  name: string;
  location: 'path' | 'query' | 'header';
  required: boolean;
  type: string;
  description?: string;
}

export interface OperationModel {
  name: string;
  method: string;
  path: string;
  summary?: string;
  pathParams: ParameterInfo[];
  queryParams: ParameterInfo[];
  hasBody: boolean;
  bodyModel?: string;
  responseModel?: string;
  responseWrapper?: 'PageResp';
}

export interface ModelProperty {
  name: string;
  originalName: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ModelDef {
  rawName: string;
  name: string;
  properties: ModelProperty[];
  folder: string;
}
