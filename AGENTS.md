# 赛马摇一摇互动游戏项目 (Horse Racing Interactive Game)

## 项目概述

这是一个完整的互动游戏项目，包含微信小程序前端、大屏显示前端、后端服务以及主持人后台管理界面。项目实现了"赛马摇一摇"小游戏的玩法，用户通过微信小程序扫码加入游戏，并在手机上点击加速按钮控制大屏上自己的卡通小马进行比赛。

### 核心技术栈

- **后端**: Node.js (NestJS), TypeScript
- **数据库**: PostgreSQL (TypeORM), Redis
- **前端**: 微信小程序, HTML/CSS/JavaScript (大屏显示)
- **实时通信**: Socket.IO, WebSocket
- **认证**: JWT (JSON Web Token)

### 项目架构

项目采用典型的前后端分离架构，包含以下主要组件：

1. **后端服务 (backend/)**: NestJS 应用，提供 REST API 和 WebSocket 服务
2. **微信小程序 (miniprogram/)**: 用户参与游戏的客户端
3. **大屏显示 (horse-race-display/)**: 游戏实时展示界面
4. **主持人控制台 (host-panel/)**: 游戏管理和控制界面

## 项目功能

### 核心游戏流程

1. **扫码加入**: 主持人在大屏幕上展示二维码，用户用微信扫描后加入游戏
2. **参与成功**: 用户在小程序显示"参与成功"信息
3. **形象分配**: 限时结束后，大屏幕为每个用户随机分配卡通小马形象
4. **疯狂点击**: 主持人开始游戏后，用户点击加速按钮
5. **实时加速**: 大屏幕小马根据用户点击速度实时加速
6. **决出胜负**: 最先到达终点的用户获得冠军
7. **排名展示**: 游戏结束后显示所有用户最终排名
8. **游戏重置**: 主持人可重置游戏，开始新比赛

### 主要模块

#### 1. 认证模块 (auth/)
- 微信用户认证
- JWT 令牌管理
- WebSocket 认证守卫

#### 2. 游戏模块 (game/)
- 游戏会话管理 (创建、开始、重置)
- 实时数据处理 (接收加速指令，计算马匹位置)
- 排名计算和更新
- WebSocket 通信 (小程序和大屏的桥梁)

#### 3. 留言墙模块 (wall/)
- 用户留言提交
- 留言审核管理
- 消息置顶功能

## 文件结构

```
.
├── README.md                           # 项目说明和使用指南
├── miniprogram/                        # 微信小程序前端代码
│   ├── app.js                          # 小程序入口文件
│   ├── app.json                        # 小程序配置
│   ├── app.wxss                        # 小程序全局样式
│   ├── images/                         # 小程序图片资源
│   └── pages/
│       ├── accelerate/                 # 加速页面
│       ├── scan/                       # 扫码页面
│       └── success/                    # 参与成功页面
├── horse-race-display/                 # 大屏显示前端代码
│   ├── index.html                      # 大屏显示主页面
│   ├── style.css                       # 大屏显示样式
│   └── script.js                       # 大屏显示逻辑
├── host-panel/                         # 主持人控制台
│   ├── index.html                      # 控制台主页面
│   ├── style.css                       # 控制台样式
│   └── script.js                       # 控制台逻辑
└── backend/                            # 后端服务
    ├── package.json                    # 项目依赖
    └── src/
        ├── app.module.ts               # 主模块
        ├── main.ts                     # 应用入口
        ├── auth/                       # 认证模块
        ├── game/                       # 游戏模块
        └── wall/                       # 留言墙模块
```

## 构建和运行

### 后端服务

1. 安装依赖：
   ```bash
   cd backend
   npm install
   ```

2. 配置环境变量：
   ```bash
   # backend/.env
   DATABASE_URL="postgresql://username:password@localhost:5432/horse_racing"
   REDIS_URL="redis://localhost:6379"
   JWT_SECRET="your-secret-key"
   ```

3. 运行开发模式：
   ```bash
   npm run start:dev
   ```

### 微信小程序

1. 使用微信开发者工具导入 `miniprogram/` 目录
2. 填写小程序 AppID（或使用测试号）
3. 运行调试

### 大屏显示

1. 使用浏览器打开 `horse-race-display/index.html`
2. 或部署到 Web 服务器

### 主持人控制台

1. 使用浏览器打开 `host-panel/index.html`
2. 登录（默认用户名: admin, 密码: password）

## 开发约定

### 代码风格

- 使用 TypeScript 编写后端代码
- 遵循 NestJS 最佳实践
- 使用 ESLint 和 Prettier 进行代码格式化

### API 设计

- RESTful API 设计原则
- 统一的错误响应格式
- JWT 认证保护敏感接口

### 数据库设计

- 使用 TypeORM 进行实体管理
- 支持 PostgreSQL 数据库
- Redis 用于实时游戏状态存储

## 重要功能实现

### 游戏状态管理

- 使用 Redis 存储实时游戏状态
- 游戏状态包括：等待、扫码中、准备开始、进行中、已结束
- 支持实时排名计算和更新

### WebSocket 通信

- 小程序、大屏显示、主持人控制台通过 WebSocket 实时通信
- 支持 Redis 适配器进行多实例扩展
- 支持房间概念区分不同游戏会话

### 留言墙审核

- 用户提交消息后需主持人审核
- 支持消息置顶、删除操作
- 实时广播审核后的消息到大屏显示

## 未来发展

### 待完成工作

- [ ] 后端服务开发: 实现完整的 API 和 WebSocket 服务
- [ ] 实时通信集成: 将小程序和大屏前端与后端服务对接
- [ ] 主持人后台开发: 实现完整的主持人管理界面
- [ ] 微信认证集成: 完成微信小程序的真实登录和用户识别
- [ ] 美术资源准备: 准备真实的小马卡通图片、背景、UI 元素等

### 注意事项

- 前端代码目前为概念验证，未包含完整错误处理和安全性
- 微信小程序需要真实 AppID 才能完整测试和发布
- 部署时需确保后端 WebSocket 服务的可访问性