# 功能手册（OpenAPI → 前端代码生成）

## 功能简介

本插件从 OpenAPI JSON 自动生成前端请求与模型代码，支持：

- 按 `tags` 拆分目录
- 生成 `request.ts / request.d.ts`
- 生成 `models` 类（snake_case → camelCase）
- 生成 `base_http` 公共请求封装
- 生成 `index.ts / index.d.ts` 统一导出
- 解析 `allOf/oneOf/anyOf`、`data` 包装、`list.items`（自动 PageResp）
- 支持配置文件 `zorycode.yaml`

## Demo 输入（配置文件）

在项目根目录创建 `zorycode.yaml`：

```yaml
swagger:
  - jsonUrl: http://127.0.0.1:4523/export/openapi/3?version=3.0
    outputDir: /domains/api-v3
    overwrite: true
    pathHidden:
      - /schedule/ws
    urlPrefix: business
    folderMap:
      用户: user
    schemasPackageMap:
      finance_receive_amount_controller: finance_service
      enterprise_controller: enterprise_service
    customModelFolder:
      User: user
    baseHttp:
      template: axios
      pageResp: |
        export interface PageData<T> {
          list: T[];
          page: number;
          size: number;
          total: number;
        }

        export interface PageResp<T> {
          data: PageData<T>;
        }
  - jsonUrl: http://127.0.0.1:4523/export/openapi/4?version=3.0
    outputDir: /domains/api-v4
    overwrite: true
    folderMap:
      游戏时长统计: gameTimeStatic
      游戏记录: gameRecord
      推送消息管理: pushMessageManagement
      推送调度管理: pushSchedulerManagement
```

## 运行方式

在 VSCode 执行命令：

```
Generate Requests from OpenAPI
```

## 预计输出结构

```
domains/api-v3/
├─ base_http.ts
├─ base_http.d.ts
├─ index.ts
├─ index.d.ts
├─ models/
│  ├─ index.ts
│  ├─ index.d.ts
│  ├─ user/
│  │  ├─ User.ts
│  │  ├─ User.d.ts
│  └─ finance_service/
│     ├─ Receivable.ts
│     ├─ Receivable.d.ts
├─ user/
│  ├─ request.ts
│  ├─ request.d.ts
└─ finance/
   ├─ request.ts
   ├─ request.d.ts
```

## 预计输出示例（request.ts）

```ts
/* eslint-disable */
import { applyPathParams, request, PageResp } from '../base_http';
import * as models from '../models';

export interface GetapiadminusersQueryParams {
  channel_id?: number[];
  department_id?: number;
  email?: string;
  page?: number;
  page_size?: number;
  role_id?: number;
  status?: number;
  username?: string;
}

/**
 * 获取用户列表
 *
 * parameters
 * @queryParam {number[]?} channel_id: 渠道ID
 * @queryParam {number?} department_id: 部门ID
 * @queryParam {string?} email: 电子邮箱
 * @queryParam {number?} page: 页码
 * @queryParam {number?} page_size: 每页条数
 * @queryParam {number?} role_id: 角色ID
 * @queryParam {number?} status: 状态(0:禁用,1:启用)
 * @queryParam {string?} username: 用户名
 * @return {PageResp<models.User[]>}
 */
export async function getApiAdminUsers(
  params?: GetapiadminusersQueryParams
): Promise<PageResp<models.User[]>> {
  const url = '/api/admin/users';
  return request<PageResp<models.User[]>>({ method: 'GET', url, params });
}
```

## base_http 模板配置

你可以在 `zorycode.yaml` 中配置 `baseHttp`，用来定制 `base_http.ts/.d.ts` 的 `PageResp` 类型与 `request` 请求模板。

支持的字段：

- `template`: `fetch | axios | custom`，默认 `fetch`
- `pageResp`: 自定义 `PageResp`/`PageData` 的 TS 片段（将直接写入 `base_http.ts/.d.ts`）
- `requestTemplate`: 自定义 `request` 函数模板（会直接替换 `base_http.ts` 中的 `request` 实现）
- `customImports`: 自定义 import 语句（会插入到 `base_http.ts` 顶部，适合引入 axios 或其他依赖）

### 使用 axios 模板

```yaml
swagger:
  jsonUrl: http://127.0.0.1:4523/export/openapi/3?version=3.0
  outputDir: /domains/api-v3
  baseHttp:
    template: axios
```

### 自定义 request 模板

```yaml
swagger:
  jsonUrl: http://127.0.0.1:4523/export/openapi/3?version=3.0
  outputDir: /domains/api-v3
  baseHttp:
    template: custom
    customImports: |
      import axios from 'axios';
    requestTemplate: |
      export async function request<T>(options: RequestOptions): Promise<T> {
        const response = await axios.request<T>({
          method: options.method,
          url: options.url,
          params: options.params,
          data: options.data,
          baseURL: BASE_URL
        });
        return response.data;
      }
```

## 预计输出示例（model）

```ts
export class User {
  /** 用户名 */
  username?: string;

  /** 电子邮箱 */
  email?: string;

  constructor(data: Omit<User, 'toJson'>) {
    this.username = data.username;
    this.email = data.email;
  }

  static fromJson(json: any): User {
    return new User({
      username: json["username"],
      email: json["email"],
    });
  }

  toJson(): any {
    return {
      "username": this.username,
      "email": this.email,
    };
  }
}
```
