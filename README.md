# VSCode Extension Starter

这是一个标准的 VSCode 插件起步模板。

## 生成 OpenAPI Request

执行 `Generate Requests from OpenAPI` 命令后，输入 OpenAPI JSON 地址与输出目录。
插件会根据 `tags` 自动拆分目录，并在每个标签目录下生成 `request.ts` 与 `request.d.ts`。

## 功能手册

详见 `docs/manual.md`。

## 使用 zorycode.yaml

若工作区根目录存在 `zorycode.yaml`，会自动读取配置生成：

```yaml
swagger:
  jsonUrl: http://127.0.0.1:4523/export/openapi?projectId=4439463&version=3.0
  outputDir: /domains/api-v3
  overwrite: true
  pathHidden:
    - /schedule/ws
  urlPrefix: business
  folderMap:
    游戏时长统计: gameTimeStatic
    游戏记录: gameRecord
    推送消息管理: pushMessageManagement
    推送调度管理: pushSchedulerManagement
  baseHttp:
    template: fetch
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
    successPath: flag
    successValues: [true]
    dataPath: data
  
```